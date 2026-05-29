import { BigInt } from "@graphprotocol/graph-ts";
import { Deposit as DepositEvent } from "../generated/AztecConnect/RollupProcessor";
import { Global, DailyInflow } from "../generated/schema";

const ETH_ASSET_ID = BigInt.zero(); // assetId 0 = native ETH in Aztec Connect

function getDayId(timestamp: BigInt): BigInt {
  return timestamp.div(BigInt.fromI32(86400));
}

function getDateString(timestamp: BigInt): string {
  // Simple YYYY-MM-DD approximation (good enough for v0; can improve later)
  let day = getDayId(timestamp);
  return day.toString(); // placeholder - real impl would use datetime lib or template
}

export function handleDeposit(event: DepositEvent): void {
  // CRITICAL SCOPE RULE: Only track shielded ETH. Nothing else.
  if (event.params.assetId.notEqual(ETH_ASSET_ID)) {
    return;
  }

  let value = event.params.depositValue;
  if (value.le(BigInt.zero())) {
    return;
  }

  let block = event.block;
  let tx = event.transaction;

  // Global cumulative odometer (the hero number for shhheth)
  let global = Global.load("1");
  if (global == null) {
    global = new Global("1");
    global.totalShieldedETH = BigInt.zero();
  }
  global.totalShieldedETH = global.totalShieldedETH.plus(value);
  global.lastUpdatedBlock = block.number;
  global.lastUpdatedTimestamp = block.timestamp;
  global.save();

  // Daily inflow for charts ("daily deposits" in the brand copy)
  let dayId = getDayId(block.timestamp);
  let day = DailyInflow.load(dayId.toString());
  if (day == null) {
    day = new DailyInflow(dayId.toString());
    day.date = getDateString(block.timestamp);
    day.shieldedETH = BigInt.zero();
  }
  day.shieldedETH = day.shieldedETH.plus(value);
  day.save();
}
