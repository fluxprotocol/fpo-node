import BufferList from "bl/BufferList";
import { fromString } from "uint8arrays/from-string";
import logger from "../../services/LoggerService";

export interface P2PMessage {
    data: string;
    signature: string;
    id: string;
    timestamp: number;
    round: number;
}

export async function extractP2PMessage(source: AsyncIterable<Uint8Array | BufferList>): Promise<P2PMessage | undefined> {
    try {
        let p2pMessage: P2PMessage | undefined;

        for await (const msg of source) {
            p2pMessage = JSON.parse(msg.toString());
        }

        return p2pMessage;
    } catch (error) {
        logger.error(`[extractP2PMessage] unknown error`, {
            error,
        });
        return undefined;
    }
}
