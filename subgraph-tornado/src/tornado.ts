import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  TornadoGlobal,
  TornadoDailyInflow,
  TornadoPoolContribution,
  TornadoDeposit,
  TornadoWithdrawal,
} from "../generated/schema";
import { Deposit as DepositEvent } from "../generated/Tornado01ETH/TornadoPool";
import { Withdrawal as WithdrawalEvent } from "../generated/Tornado01ETH/TornadoPool";

const ONE_DAY = BigInt.fromI32(86400);

function denomWei(pool: string): BigInt {
  if (pool == "0.1") return BigInt.fromString("100000000000000000");
  if (pool == "1") return BigInt.fromString("1000000000000000000");
  if (pool == "10") return BigInt.fromString("10000000000000000000");
  return BigInt.fromString("100000000000000000000"); // 100
}

function getDayId(timestamp: BigInt): BigInt {
  return timestamp.div(ONE_DAY);
}

function formatDate(timestamp: BigInt): string {
  return getDayId(timestamp).toString();
}

function eventId(txHash: Bytes, logIndex: BigInt): string {
  return txHash.toHexString() + "-" + logIndex.toString();
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

function recordDeposit(pool: string, event: DepositEvent): void {
  let value = denomWei(pool);
  updateGlobal(value, event.block.number, event.block.timestamp);
  updatePool(pool, value);

  let row = new TornadoDeposit(eventId(event.transaction.hash, event.logIndex));
  row.pool = pool;
  row.amount = value;
  row.from = event.transaction.from;
  row.commitment = event.params.commitment;
  row.leafIndex = event.params.leafIndex;
  row.timestamp = event.block.timestamp;
  row.blockNumber = event.block.number;
  row.txHash = event.transaction.hash;
  row.logIndex = event.logIndex;
  row.save();
}

function recordWithdrawal(pool: string, event: WithdrawalEvent): void {
  let value = denomWei(pool);

  let row = new TornadoWithdrawal(eventId(event.transaction.hash, event.logIndex));
  row.pool = pool;
  row.amount = value;
  row.to = event.params.to;
  row.relayer = event.params.relayer;
  row.nullifierHash = event.params.nullifierHash;
  row.fee = event.params.fee;
  row.timestamp = event.block.timestamp;
  row.blockNumber = event.block.number;
  row.txHash = event.transaction.hash;
  row.logIndex = event.logIndex;
  row.save();
}

// ---- 0.1 ETH pool ----
export function handleDeposit01(event: DepositEvent): void {
  recordDeposit("0.1", event);
}
export function handleWithdrawal01(event: WithdrawalEvent): void {
  recordWithdrawal("0.1", event);
}

// ---- 1 ETH pool ----
export function handleDeposit1(event: DepositEvent): void {
  recordDeposit("1", event);
}
export function handleWithdrawal1(event: WithdrawalEvent): void {
  recordWithdrawal("1", event);
}

// ---- 10 ETH pool ----
export function handleDeposit10(event: DepositEvent): void {
  recordDeposit("10", event);
}
export function handleWithdrawal10(event: WithdrawalEvent): void {
  recordWithdrawal("10", event);
}

// ---- 100 ETH pool ----
export function handleDeposit100(event: DepositEvent): void {
  recordDeposit("100", event);
}
export function handleWithdrawal100(event: WithdrawalEvent): void {
  recordWithdrawal("100", event);
}
