import Big from "big.js";
import { JSONPath } from "jsonpath-plus"
import { Source } from "../../modules/pushPair/models/PushPairConfig";
import logger from "../../services/LoggerService";
import { sleep } from "../../services/TimerUtils";

/**
 * Same as `@fluxprotocol/oracle-vm/dist/models/ExecuteResult`.
 */
interface ExecuteResult {
    code: number;
    gasUsed: string;
    logs: string[];
}

/**
 * Error structure used by fetch execution:
 * - code: same codes as in `basic-fetch-wasm`
 * - message: human-readable reason
 * - args: execution arguments
 */
interface ExecutionError {
    code: string;
    message: string;
}

/**
 * Basic fetching of HTTP data with JSON paths (instead of previously used WASM VMs).
 *
 * Port of source code: https://github.com/fluxprotocol/basic-fetch-wasm
 *
 * Sample input arguments:
 * ```
 * [
 *   'FetchJob',
 *   '[{"source_path":"$.market_data.current_price.usd","end_point":"https://api.coingecko.com/api/v3/coins/ethereum"}]',
 *   'number',
 *   '1000000'
 * ]
 * ```
 *
 * Sample WASM valid output:
 * ```
 * {
 *  code: 0,
 *  gasUsed: '2154667330',
 *  logs: [
 *    'Matching values found: 1',
 *    'url: https://api.coingecko.com/api/v3/coins/ethereum, source: $.market_data.current_price.usd, result: Some(BigDecimal("2760.01"))',
 *    'used sources: 1/1',
 *    '',
 *    '{"type":"Valid","value":"2760010000"}'
 *  ]
 * }
 * ```
 *
 * Sample WASM invalid output:
 * ```
 * {
 *  code: 1,
 *  logs: [
 *    "thread 'main' panicked at 'assertion failed: `(left != right)`",
 *    '  left: `0`,',
 *    " right: `0`: ERR_NO_SOURCES', src/main.rs:31:5",
 *    'note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace',
 *    ''
 *  ],
 *  gasUsed: '1487247'
 * }
 * ```
 * @param {ExecuteInput} args
 */
export async function executeFetch(args: string[]): Promise<ExecuteResult> {
    const funcName = "[executeBasicFetch]";

    let logs: string[] = [];

    // Check arguments (not gracefully checked in WASM VM)
    if (args.length < 3) {
        return buildExecutionOutput({
            code: "ERR_INSUFFICIENT_ARGS",
            message: `${funcName} called with insufficient arguments (args.length < 3)`,
        });
    }

    const sources: Source[] = JSON.parse(args[1]);
    const sourcesType: string = args[2];

    let stringResult = "";
    let numberResult = new Big(0);
    let usedSources = 0;

    // Check - no sources
    if (sources.length == 0) {
        return buildExecutionOutput({
            code: "ERR_NO_SOURCES",
            message: `${funcName} called with no sources (args[1].length == 0)`,
        });
    }

    // ERRORs - types
    if (sourcesType == 'string') {
        if (sources.length != 1) {
            return buildExecutionOutput({
                code: "ERR_TOO_MUCH_SOURCES",
                message: `${funcName} called with too many sources for sourcesType = 'string' (sources.length != 1)`,
            });
        }
    } else if (sourcesType == 'number') {
        if (args[3] === 'undefined') {
            return buildExecutionOutput({
                code: "ERR_NO_MULTIPLIER",
                message: `${funcName} called with no multiplier for sourcesType = 'number' (args[3] === 'undefined')`,
            });
        }
    } else {
        return buildExecutionOutput({
            code: "ERR_UNSUPPORTED_TYPE",
            message: `${funcName} called with unsupported sourcesType (sourceType != 'string' | 'number')`,
        });
    }

    for await (let source of sources) {
        let httpResponse: Response | undefined;
        try {
            httpResponse = await retryFetch(source.end_point, {
                method: source.http_method,
                body: source.http_body,
                headers: source.http_headers,
            });
        } catch (error) {
            return buildExecutionOutput({
                code: "ERR_HTTP_UNKNOWN",
                message: `${funcName} could not fetch ${error}`,
            });
        }

        if (!httpResponse.ok) {
            return buildExecutionOutput({
                code: "ERR_HTTP_ERROR",
                message: `${funcName} could not fetch (status: ${httpResponse.status}))`,
            });
        }

        let json;
        try {
            json = await httpResponse.json();
        } catch (error) {
            return buildExecutionOutput({
                code: "ERR_HTTP_NO_JSON",
                message: `${funcName} http response could not be parsed into JSON (error: ${error})`,
            });
        }

        // Finds a value in the returned json using the path given in args
        const finder = JSONPath({ json, path: source.source_path });

        // Error - no results in JSON path
        if (finder.length == 0) {
            return buildExecutionOutput({
                code: "ERR_SOURCE_PATH",
                message: `${funcName} invalid source path (path = ${source.source_path})`,
            });
        }

        const resultValue = finder[0];
        logs.push(`Matching values found: ${finder[0]}`);

        if (sourcesType === 'string') {
            if (finder > 1) {
                stringResult = JSON.stringify(finder);
            } else {
                stringResult = resultValue;
            }
        } else if (sourcesType === 'number') {
            // Error - too many results
            if (finder.length > 1) {
                return buildExecutionOutput({
                    code: "ERR_TOO_MUCH_RESULTS",
                    message: `${funcName} too many results for sourcesType 'number' (finder.length = ${finder.length} > 1)`,
                });
            }

            const val = source.multiplier ? Big(resultValue).mul(source.multiplier) : Big(resultValue);
            logs.push(`url: ${source.end_point}, source: ${source.source_path}, result: ${val.toString()}`);

            numberResult = numberResult.add(val);
        }

        usedSources += 1;
    }

    logs.push(`used sources: ${usedSources}/${sources.length}`);

    // Error - no sources
    if (usedSources == 0) {
        return buildExecutionOutput({
            code: "ERR_FAILING_SOURCES",
            message: `${funcName} all sources are failing (usedSources == 0)`,
        });
    }

    if (sourcesType === 'string') {
        logs.push(`{"type":"Valid","value":"${stringResult}"}`);
    } else if (sourcesType === 'number') {
        let multiplier = Big(args[3]);
        numberResult = numberResult.div(Big(usedSources)).mul(multiplier).round(0);

        logs.push(`{"type":"Valid","value":"${numberResult}"}`);
    }

    return {
        code: 0,        // success
        gasUsed: "0",   // no gas (no VM)
        logs
    };
}

function buildExecutionOutput(error: ExecutionError): ExecuteResult {
    return {
        code: 1,
        gasUsed: "0",
        logs: [JSON.stringify(error)]
    }
}

async function retryFetch(input: RequestInfo, init?: RequestInit, maxRetries = 5, waitTimeMs = 200): Promise<Response> {
    let response: Response | undefined;

    try {
        response = await fetch(input, init);

        if (response.ok || (maxRetries - 1) === 0) {
            return response;
        }

        logger.warn(`[retryFetch] HTTP error ${response.status}: ${response.statusText}`, {
            fingerprint: "executeFetch-retry-not-ok",
            url: response.url,
            statusText: response.statusText
        });
        await sleep(waitTimeMs);

        return retryFetch(input, init, maxRetries - 1, waitTimeMs);
    } catch (error) {
        if ((maxRetries - 1) === 0) {
            throw error;
        }

        logger.warn(`[retryFetch] Fetching failed (retries left = ${maxRetries})`, {
            error,
            fingerprint: "executeFetch-retry-failure"
        });
        await sleep(waitTimeMs);

        return retryFetch(input, init, maxRetries - 1, waitTimeMs);
    }
}
