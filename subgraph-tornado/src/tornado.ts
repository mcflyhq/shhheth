import { BigInt } from "@graphprotocol/graph-ts";
import {
  TornadoGlobal,
  TornadoDailyInflow,
  TornadoPoolContribution,
} from "../generated/schema";
import { Deposit as DepositEvent } from "../generated/Tornado01ETH/TornadoPool";

const ONE_DAY = BigInt.fromI32(86400);

const DENOMINATIONS: Map<string, BigInt> = new Map<string, BigInt>();
DENOMINATIONS.set("0.1", BigInt.fromString("100000000000000000"));
DENOMINATIONS.set("1", BigInt.fromString("1000000000000000000"));
DENOMINATIONS.set("10", BigInt.fromString("10000000000000000000"));
DENOMINATIONS.set("100", BigInt.fromString("100000000000000000000"));

function getDayId(timestamp: BigInt): BigInt {
  return timestamp.div(ONE_DAY);
}

function formatDate(timestamp: BigInt): string {
  // Simple epoch day based date label (frontend can prettify)
  let day = getDayId(timestamp);
  return day.toString();
}

function updateGlobal(value: BigInt, blockNumber: BigInt, timestamp: BigInt): void {
  let global = TornadoGlobal.load("1");
  if (global == null) {
    global = new TornadoGlobal("1");
    global.totalShieldedETH = BigInt.zero();
  }
  global.totalShieldedETH = global.totalShieldedETH.plus(value);
  global.lastUpdatedBlock = blockNumber;
  global.lastUpdatedTimestamp = timestamp;
  global.save();

  // Daily inflow
  let dayId = getDayId(timestamp).toString();
  let day = TornadoDailyInflow.load(dayId);
  if (day == null) {
    day = new TornadoDailyInflow(dayId);
    day.date = formatDate(timestamp);
    day.shieldedETH = BigInt.zero();
  }
  day.shieldedETH = day.shieldedETH.plus(value);
  day.save();
}

function updatePool(pool: string, value: BigInt): void {
  let contrib = TornadoPoolContribution.load(pool);
  if (contrib == null) {
    contrib = new TornadoPoolContribution(pool);
    contrib.pool = pool;
    contrib.totalShieldedETH = BigInt.zero();
  }
  contrib.totalShieldedETH = contrib.totalShieldedETH.plus(value);
  contrib.save();
}

// Handlers for each pool
export function handleDeposit01(event: DepositEvent): void {
  let value = DENOMINATIONS.get("0.1") as BigInt;
  updateGlobal(value, event.block.number, event.block.timestamp);
  updatePool("0.1", value);
}

export function handleDeposit1(event: DepositEvent): void {
  let value = DENOMINATIONS.get("1") as BigInt;
  updateGlobal(value, event.block.number, event.block.timestamp);
  updatePool("1", value);
}

export function handleDeposit10(event: DepositEvent): void {
  let value = DENOMINATIONS.get("10") as BigInt;
  updateGlobal(value, event.block.number, event.block.timestamp);
  updatePool("10", value);
}

export function handleDeposit100(event: DepositEvent): void {
  let value = DENOMINATIONS.get("100") as BigInt;
  updateGlobal(value, event.block.number, event.block.timestamp);
  updatePool("100", value);
}
