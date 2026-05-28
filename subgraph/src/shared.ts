import { BigInt, ethereum } from "@graphprotocol/graph-ts"
import { GlobalCounter, ProtocolCounter } from "../generated/schema"

const GLOBAL_ID = "global"
const ONE = BigInt.fromI32(1)

export function recordDeposit(
  amountWei: BigInt,
  protocolId: string,
  protocolName: string,
  block: ethereum.Block,
): void {
  let global = GlobalCounter.load(GLOBAL_ID)
  if (global == null) {
    global = new GlobalCounter(GLOBAL_ID)
    global.totalETH = BigInt.zero()
    global.depositCount = BigInt.zero()
  }
  global.totalETH = global.totalETH.plus(amountWei)
  global.depositCount = global.depositCount.plus(ONE)
  global.lastUpdatedBlock = block.number
  global.lastUpdatedTimestamp = block.timestamp
  global.save()

  let proto = ProtocolCounter.load(protocolId)
  if (proto == null) {
    proto = new ProtocolCounter(protocolId)
    proto.name = protocolName
    proto.totalETH = BigInt.zero()
    proto.depositCount = BigInt.zero()
    proto.firstDepositBlock = block.number
  }
  proto.totalETH = proto.totalETH.plus(amountWei)
  proto.depositCount = proto.depositCount.plus(ONE)
  proto.lastUpdatedBlock = block.number
  proto.lastUpdatedTimestamp = block.timestamp
  proto.save()
}
