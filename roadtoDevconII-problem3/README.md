# Road to Devcon II — Problem 3: The Aggregator Who Pays Late

Shared treasury for 16 Warli painters. Buyer money lands in `CooperativeTreasury` and splits automatically across **current members** by on-chain shares — no hardcoded percentages, no push loop.

## How a payment splits

1. **Shares are on-chain state** (`members[addr].share` + `totalShares`), readable via `getMemberShares()` / `getTotalShares()`. Cooperative members can adjust shares together (remove + add).
2. **Current members, not deployment snapshot**: a `Payment` is recorded with `amount`. When a member calls `withdraw(paymentId)` the contract reads their `share` and `totalShares` *at withdraw time*. A member added after a payment was deposited will get a share of that payment (they are current); a member removed before withdraw gets `0` (see below). This matches the spec "across whoever the current members actually are".
3. **Pull-payment**: members call `withdraw(uint256 paymentId)` themselves. No loop that pushes to everyone — saves gas and is reentrancy-safe (checks-effects-interactions + `call` with check).
4. **Leftover dust**: `share = amount * memberShare / totalShares` uses integer division. The remainder (dust) stays in `address(this).balance`. It never disappears and is sweepable by `DEFAULT_ADMIN_ROLE` via `sweepDust(to, amount)` (event `DustSwept`). This satisfies "don't let leftover just disappear / no stuck money with nowhere to go".
5. **No double-pay / no removed paid again**: `mapping(paymentId => member => bool) hasWithdrawn` ensures `Already withdrawn` revert on second claim. Inactive members are short-circuited to `0` and marked withdrawn, so a removed member stops receiving *future* (and current, if they haven't claimed) splits.

Example: `totalShares = 10000` (A 4000, B 3500, C 2500), buyer sends `10000 wei` → paymentId 1.
- A `withdraw(1)` → `10000*4000/10000 = 4000 wei`
- B → `3500 wei`, C → `2500 wei`. Dust `0` in this case; with `10001 wei`, dust `1 wei` stays in treasury for sweep.

## Roles

- `DEFAULT_ADMIN_ROLE` (deployer) and `COOPERATIVE_ROLE` (granted to deployer) via OpenZeppelin `AccessControl`. `addMember` / `removeMember` are `onlyRole(COOPERATIVE_ROLE)`, `sweepDust` is `onlyRole(DEFAULT_ADMIN_ROLE)`.

## Contract

`src/CooperativeTreasury.sol` (`pragma ^0.8.24`, `is AccessControl`)

Key functions:
- `addMember(address, uint256 share)` — basis points, `1..10000`
- `removeMember(address)` — reduces `totalShares`, marks inactive
- `deposit() payable` — creates `Payment` with `amount = msg.value`
- `withdraw(uint256 paymentId)` — pull, reads on-chain shares, prevents double claim
- `sweepDust(address, uint256)` — admin handles remainder

## Tests (Foundry)

`test/CooperativeTreasury.t.sol` — 7 tests, all passing:

- `test_MembersCanJoinWithShares` — shares readable from state
- `test_AdminCanRemoveMember` — removal reduces `totalShares`
- `test_MemberCanAddThenRemove` — join/leave mid-cycle
- `test_RemovedMemberNotPaidAgain` — removed member withdraws `0`, not revert
- `test_PaymentDepositAndWithdrawal` — 1 ETH splits 40/35/25
- `test_SharesDivideCorrectly` — `10000 wei` splits exactly
- `test_MultiplePayments` — two payments (1 ETH + 2 ETH) each split by current shares

Run:
```bash
forge test -vv
```

## Stack

Solidity ^0.8.24, Foundry, OpenZeppelin AccessControl, hand-rolled pull-payment, Base Sepolia ready.

## Deploy (Base Sepolia)

```bash
forge script script/Deploy.svelte --rpc-url $BASE_SEPOLIA_RPC --broadcast
```
