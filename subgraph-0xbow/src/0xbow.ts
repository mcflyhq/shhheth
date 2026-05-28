import { BigInt } from "@graphprotocol/graph-ts";
import { Deposited as DepositedEvent } from "../generated/PrivacyPoolETH/PrivacyPool";
import { BowDailyInflow, BowGlobal } from "../generated/schema";

// The 0xbow / Privacy Pools ETH pool is ETH-native — every Deposited event
// represents native ETH being shielded. _value is the wei amount.
const GLOBAL_ID = "1";
const ONE_DAY = BigInt.fromI32(86400);
const ONE = BigInt.fromI32(1);

export function handleDeposited(event: DepositedEvent): void {
  let value = event.params._value;

  let global = BowGlobal.load(GLOBAL_ID);
  if (global == null) {
    global = new BowGlobal(GLOBAL_ID);
    global.totalShieldedETH = BigInt.zero();
    global.depositCount = BigInt.zero();
  }
  global.totalShieldedETH = global.totalShieldedETH.plus(value);
  global.depositCount = global.depositCount.plus(ONE);
  global.lastUpdatedBlock = event.block.number;
  global.lastUpdatedTimestamp = event.block.timestamp;
  global.save();

  let dayId = event.block.timestamp.div(ONE_DAY).toString();
  let day = BowDailyInflow.load(dayId);
  if (day == null) {
    day = new BowDailyInflow(dayId);
    day.date = dayId;
    day.shieldedETH = BigInt.zero();
    day.depositCount = BigInt.zero();
  }
  day.shieldedETH = day.shieldedETH.plus(value);
  day.depositCount = day.depositCount.plus(ONE);
  day.save();
}
