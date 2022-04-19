import Big from "big.js";
import { createBlockMock } from "../mocks/BlockMock";
import { createDataRequestMock } from "../mocks/DataRequestMock";
import { createNetworkMock } from "../mocks/NetworkMock";
import { hasBatchEnoughConfirmations } from "./DataRequestBatch";

describe('DataRequestBatch', () => {
    describe('hasBatchEnoughConfirmations', () => {
        it('should return false when one needs more confirmations required', () => {
            const details = hasBatchEnoughConfirmations({
                internalId: '1',
                targetNetwork: createNetworkMock(),
                requests: [
                    createDataRequestMock({
                        confirmationsRequired: new Big(100),
                        createdInfo: {
                            block: createBlockMock({ number: new Big(1) })
                        },
                    })
                ],
            }, createBlockMock({ number: new Big(10) }));

            expect(details.confirmed).toBe(false);
        });

        it('should return true when all requests are confirmed', () => {
            const details = hasBatchEnoughConfirmations({
                internalId: '1',
                targetNetwork: createNetworkMock(),
                requests: [
                    createDataRequestMock({
                        confirmationsRequired: new Big(100),
                        createdInfo: {
                            block: createBlockMock({ number: new Big(1) })
                        },
                    }),
                    createDataRequestMock({
                        confirmationsRequired: new Big(50),
                        createdInfo: {
                            block: createBlockMock({ number: new Big(4) })
                        },
                    })
                ],
            }, createBlockMock({ number: new Big(150) }));

            expect(details.confirmed).toBe(true);
        });

        it('should return false when one request is not confirmed yet', () => {
            const details = hasBatchEnoughConfirmations({
                internalId: '1',
                targetNetwork: createNetworkMock(),
                requests: [
                    createDataRequestMock({
                        confirmationsRequired: new Big(100),
                        createdInfo: {
                            block: createBlockMock({ number: new Big(1) })
                        },
                    }),
                    createDataRequestMock({
                        confirmationsRequired: new Big(500),
                        createdInfo: {
                            block: createBlockMock({ number: new Big(4) })
                        },
                    })
                ],
            }, createBlockMock({ number: new Big(150) }));

            expect(details.confirmed).toBe(false);
        });
    });
});
