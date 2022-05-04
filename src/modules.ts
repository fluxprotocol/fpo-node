import { FetchJob } from "./jobs/fetch/FetchJob";
import { BalanceCheckerModule } from "./modules/balanceChecker/BalanceCheckerModule";
import { LayerZeroModule } from "./modules/layerZero/LayerZeroModule";
import { PairCheckerModule } from "./modules/pairChecker/PairCheckerModule";
import { PairDeviationCheckerModule } from "./modules/pairDeviationChecker/PairDeviationCheckerModule";
import { PushPairModule } from "./modules/pushPair/PushPairModule";
import EvmNetwork from "./networks/evm/EvmNetwork";
import { NearNetwork } from "./networks/near/NearNetwork";

export const AVAILABLE_NETWORKS = [EvmNetwork, NearNetwork];
export const AVAILABLE_MODULES = [LayerZeroModule, PushPairModule, BalanceCheckerModule, PairCheckerModule, PairDeviationCheckerModule];
export const AVAILABLE_JOBS = [FetchJob];
