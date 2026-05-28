import { BigInt } from "@graphprotocol/graph-ts";
import { Deposit as DepositEvent } from "../generated/Tornado01ETH/TornadoPool";
import { recordDeposit } from "./shared";

const PROTOCOL_ID = "tornado";
const PROTOCOL_NAME = "Tornado Cash";

const POINT_ONE_ETH = BigInt.fromString("100000000000000000");
const ONE_ETH = BigInt.fromString("1000000000000000000");
const TEN_ETH = BigInt.fromString("10000000000000000000");
const HUNDRED_ETH = BigInt.fromString("100000000000000000000");

export function handleTornadoDeposit01(event: DepositEvent): void {
  recordDeposit(POINT_ONE_ETH, PROTOCOL_ID, PROTOCOL_NAME, event.block);
}

export function handleTornadoDeposit1(event: DepositEvent): void {
  recordDeposit(ONE_ETH, PROTOCOL_ID, PROTOCOL_NAME, event.block);
}

export function handleTornadoDeposit10(event: DepositEvent): void {
  recordDeposit(TEN_ETH, PROTOCOL_ID, PROTOCOL_NAME, event.block);
}

export function handleTornadoDeposit100(event: DepositEvent): void {
  recordDeposit(HUNDRED_ETH, PROTOCOL_ID, PROTOCOL_NAME, event.block);
}
