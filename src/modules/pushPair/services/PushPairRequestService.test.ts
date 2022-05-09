import Big from "big.js";
import { createDataRequestMock } from "../../../mocks/DataRequestMock";
import { PushPairDataRequest } from "../models/PushPairDataRequest";
import { shouldPricePairUpdate } from "./PushPairRequestService";

const ONE_HOUR = 3600000;

describe('PushPairRequestService', () => {
    describe('shouldPricePairUpdate', () => {
        it('should return true if there is no oldPrice', () => {
            const dr = createDataRequestMock({
                extraInfo: {
                    deviationPercentage: 10,
                    minimumUpdateInterval: ONE_HOUR, // 1 hour
                }
            } as Partial<PushPairDataRequest>) as PushPairDataRequest;

            const result = shouldPricePairUpdate(dr, 1000000, new Big(1));
            expect(result).toBe(true);
        });

        it('should return true if price hasn\'t been updated in a while', () => {
            const dr = createDataRequestMock({
                extraInfo: {
                    deviationPercentage: 10,
                    minimumUpdateInterval: ONE_HOUR,
                }
            } as Partial<PushPairDataRequest>) as PushPairDataRequest;

            const result = shouldPricePairUpdate(dr, Date.now() - (ONE_HOUR + 100), new Big(1), new Big(1.1));
            expect(result).toBe(true);
        });

        it('should return true if price is deviating too much from the old price', () => {
            const dr = createDataRequestMock({
                extraInfo: {
                    deviationPercentage: 11.2,
                    minimumUpdateInterval: ONE_HOUR,
                }
            } as Partial<PushPairDataRequest>) as PushPairDataRequest;

            const oldPrice = new Big(1);
            const newPrice = new Big(1.24);

            const result = shouldPricePairUpdate(dr, Date.now() - 1, newPrice, oldPrice);
            expect(result).toBe(true);
        });

        it('should return true if price is deviating exactly the deviationPercentage', () => {
            const dr = createDataRequestMock({
                extraInfo: {
                    deviationPercentage: 11,
                    minimumUpdateInterval: ONE_HOUR,
                }
            } as Partial<PushPairDataRequest>) as PushPairDataRequest;

            const oldPrice = new Big(1);
            const newPrice = new Big(1.11);

            const result = shouldPricePairUpdate(dr, Date.now() - 1, newPrice, oldPrice);
            expect(result).toBe(true);
        });

        it('should return false if price is not deviating too much', () => {
            const dr = createDataRequestMock({
                extraInfo: {
                    deviationPercentage: 5,
                    minimumUpdateInterval: ONE_HOUR,
                }
            } as Partial<PushPairDataRequest>) as PushPairDataRequest;

            const oldPrice = new Big(1);
            const newPrice = new Big(1.02);

            const result = shouldPricePairUpdate(dr, Date.now() - 1, newPrice, oldPrice);
            expect(result).toBe(false);
        });

        it('should return true if price is deviating too much in the negative direction', () => {
            const dr = createDataRequestMock({
                extraInfo: {
                    deviationPercentage: 5,
                    minimumUpdateInterval: ONE_HOUR,
                }
            } as Partial<PushPairDataRequest>) as PushPairDataRequest;

            const oldPrice = new Big(1);
            const newPrice = new Big(0.2);

            const result = shouldPricePairUpdate(dr, Date.now() - 1, newPrice, oldPrice);
            expect(result).toBe(true);
        });

        it('should return false if price is deviating not too much in the negative direction', () => {
            const dr = createDataRequestMock({
                extraInfo: {
                    deviationPercentage: 5,
                    minimumUpdateInterval: ONE_HOUR,
                }
            } as Partial<PushPairDataRequest>) as PushPairDataRequest;

            const oldPrice = new Big(1);
            const newPrice = new Big(0.96);

            const result = shouldPricePairUpdate(dr, Date.now() - 1, newPrice, oldPrice);
            expect(result).toBe(false);
        });
    });
});
