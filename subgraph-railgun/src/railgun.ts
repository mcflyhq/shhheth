import { Address, BigInt } from "@graphprotocol/graph-ts";
import { Shield as ShieldEvent } from "../generated/RailgunSmartWallet/RailgunSmartWallet";
import { RailgunDailyInflow, RailgunGlobal } from "../generated/schema";

// Ethereum mainnet WETH. Railgun wraps ETH to WETH before shielding,
// so this is the only token address we count toward "shielded ETH".
const WETH = Address.fromString("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");

// TokenType enum: 0 = ERC20, 1 = ERC721, 2 = ERC1155
const ERC20: i32 = 0;

const GLOBAL_ID = "1";
const ONE_DAY = BigInt.fromI32(86400);
const ONE = BigInt.fromI32(1);

export function handleShield(event: ShieldEvent): void {
  let commitments = event.params.commitments;
  let ethDelta = BigInt.zero();
  let count = 0;

  for (let i = 0; i < commitments.length; i++) {
    let c = commitments[i];
    if (c.token.tokenType == ERC20 && c.token.tokenAddress.equals(WETH)) {
      ethDelta = ethDelta.plus(c.value);
      count += 1;
    }
  }

  if (ethDelta.equals(BigInt.zero())) {
    return;
  }

  let global = RailgunGlobal.load(GLOBAL_ID);
  if (global == null) {
    global = new RailgunGlobal(GLOBAL_ID);
    global.totalShieldedETH = BigInt.zero();
    global.shieldCount = BigInt.zero();
  }
  global.totalShieldedETH = global.totalShieldedETH.plus(ethDelta);
  global.shieldCount = global.shieldCount.plus(BigInt.fromI32(count));
  global.lastUpdatedBlock = event.block.number;
  global.lastUpdatedTimestamp = event.block.timestamp;
  global.save();

  let dayId = event.block.timestamp.div(ONE_DAY).toString();
  let day = RailgunDailyInflow.load(dayId);
  if (day == null) {
    day = new RailgunDailyInflow(dayId);
    day.date = dayId;
    day.shieldedETH = BigInt.zero();
    day.shieldCount = BigInt.zero();
  }
  day.shieldedETH = day.shieldedETH.plus(ethDelta);
  day.shieldCount = day.shieldCount.plus(BigInt.fromI32(count));
  day.save();
}
