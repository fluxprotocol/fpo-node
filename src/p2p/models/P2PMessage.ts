import BufferList from "bl/BufferList";
import { P2PVersion } from "../../modules/p2p/models/P2PVersion";
import logger from "../../services/LoggerService";

export interface P2PMessage {
    data: string;
    hashFeedId: string;
    signature: string;
    id: string;
    timestamp: number;
    round: number;
    signer: string;
    node_version: P2PVersion;
    report_version: P2PVersion;
}

export async function extractP2PMessage(source: AsyncIterable<Uint8Array | BufferList>): Promise<P2PMessage | undefined> {
    try {
        let p2pMessage: P2PMessage | undefined;

        for await (const msg of source) {
            p2pMessage = JSON.parse(msg.toString());
            console.log(`p2pMessage nv: ${p2pMessage?.node_version} ${typeof p2pMessage?.node_version}`);
            console.log(`p2pMessage nv: ${p2pMessage?.node_version} ${typeof p2pMessage?.node_version}`);
        }

        return p2pMessage;
    } catch (error) {
        logger.error(`[extractP2PMessage] unknown error`, {
            error,
        });
        return undefined;
    }
}