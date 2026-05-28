import { Deposited } from "../generated/PrivacyPoolETH/PrivacyPool"
import { recordDeposit } from "./shared"

export function handlePrivacyPoolsDeposit(event: Deposited): void {
  recordDeposit(event.params._value, "privacy-pools", "Privacy Pools", event.block)
}
