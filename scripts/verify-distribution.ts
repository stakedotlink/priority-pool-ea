import base58 from 'bs58'
import { ethers } from 'ethers'
import fse from 'fs-extra'
import axios from 'axios'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { PriorityPoolABI } from '../src/config/PriorityPoolABI'
import { DistributionOracleABI } from '../src/config/DistributionOracleABI'

/*
 * This script will calculate priority pool distribution data for any past distribution
 *
 * Before running, set the following:
 * RPC_URL: ETH Mainnet RPC URL
 * BLOCK_NUMBER: block number of a previous distribution
 * IPFS_GATEWAY_URL: URL for IPFS Gateway (optional)
 */

const CHAIN_ID = 1
const PRIORITY_POOL_CONTRACT_ADDRESS = '0xDdC796a66E8b83d0BcCD97dF33A6CcFBA8fd60eA'
const DISTRIBUTION_ORACLE_CONTRACT_ADDRESS = '0x2285AC429cCCAaE7cC1E27BfBe617bC626B443CF'
const IPFS_GATEWAY_URL = process.env.IPFS_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs'

/*
 * Calculates:
 * - the queued token balance for each account
 * - the reSDL balance for each account
 * - the total reSDL across all accounts (only counted if the account has
 *   a queued token balance > 0)
 * - the total number of accounts that hold no reSDL (only counted if the account
 *   has a queued token balance > 0)
 */
export function getAccountBalances(treeData: any, accountData: any) {
  let [accounts, reSDLBalanceData, queuedBalanceData] = accountData

  let qTokenBalances = [BigInt(0)]
  let reSDLBalances = [BigInt(0)]
  let reSDLTotal = BigInt(0)
  let nonSDLAccounts = BigInt(0)

  for (let i = 1; i < accounts.length; i++) {
    let qTokenBalance = BigInt(queuedBalanceData[i]) - BigInt(treeData[accounts[i]]?.amount || 0)
    let reSDLBalance = BigInt(reSDLBalanceData[i])

    qTokenBalances.push(qTokenBalance)
    reSDLBalances.push(reSDLBalance)

    if (qTokenBalance != BigInt(0)) {
      reSDLTotal += reSDLBalance
    }
    if (qTokenBalance != BigInt(0) && reSDLBalance == BigInt(0)) {
      nonSDLAccounts++
    }
  }

  return { qTokenBalances, reSDLBalances, reSDLTotal, nonSDLAccounts }
}

/*
 * Calculates the amount of LSD tokens each account should receive based on
 * its reSDL balance and queued token balance (ignores accounts that hold no reSDL).
 * The amount is distributed across accounts proportional to each account's share of
 * the total reSDL supply up to a maximum of each account's queued token balance
 */
export function getPrimaryDistributionAmounts(
  qTokenBalances: any,
  reSDLBalances: any,
  reSDLTotal: any,
  toDistribute: any
): { amountsToReceive: any; distributed: any } {
  const initialToDistribute = toDistribute
  const numAccounts = qTokenBalances.length
  const amountsToReceive = new Array(numAccounts).fill(BigInt(0))

  if (reSDLTotal == BigInt(0) || toDistribute < BigInt(1e18)) {
    return { amountsToReceive, distributed: BigInt(0) }
  }

  while (true) {
    let distributed = BigInt(0)
    let reSDLTotalDecrease = BigInt(0)

    for (let i = 1; i < numAccounts; i++) {
      let qTokenBalance = qTokenBalances[i]
      if (qTokenBalance == BigInt(0)) continue

      let reSDLBalance = reSDLBalances[i]
      let toReceive: any = (toDistribute * reSDLBalance) / reSDLTotal

      if (amountsToReceive[i] + toReceive >= qTokenBalance) {
        toReceive = qTokenBalance - amountsToReceive[i]
        qTokenBalances[i] = BigInt(0)
        reSDLTotalDecrease += reSDLBalance
      }

      amountsToReceive[i] += toReceive
      distributed += toReceive
    }

    toDistribute -= distributed
    reSDLTotal -= reSDLTotalDecrease
    if (distributed == BigInt(0) || reSDLTotal == BigInt(0)) break
  }

  return { amountsToReceive, distributed: initialToDistribute - toDistribute }
}

/*
 * Calculates the amount of LSD tokens each account should receive based on
 * its queued token balance (ignores accounts that hold any reSDL). The amount is
 * distributed evenly across all accounts up to a maximum of each account's queued
 * token balance
 */
export function getSecondaryDistributionAmounts(
  qTokenBalances: any,
  reSDLBalances: any,
  nonSDLAccounts: any,
  toDistribute: any
): { amountsToReceive: any; distributed: any } {
  const initialToDistribute = toDistribute
  const numAccounts = qTokenBalances.length
  const amountsToReceive = new Array(numAccounts).fill(BigInt(0))

  if (nonSDLAccounts == BigInt(0) || toDistribute < BigInt(1e18)) {
    return { amountsToReceive, distributed: BigInt(0) }
  }

  while (true) {
    let toReceive: any = toDistribute / nonSDLAccounts
    let distributed = BigInt(0)

    for (let i = 1; i < numAccounts; i++) {
      let qTokenBalance = qTokenBalances[i]
      if (qTokenBalance == BigInt(0) || reSDLBalances[i] != BigInt(0)) continue

      let accountToReceive = toReceive

      if (amountsToReceive[i] + accountToReceive >= qTokenBalance) {
        accountToReceive = qTokenBalance - amountsToReceive[i]
        qTokenBalances[i] = BigInt(0)
        nonSDLAccounts--
      }

      amountsToReceive[i] += accountToReceive
      distributed += accountToReceive
    }

    toDistribute -= distributed
    if (distributed == BigInt(0) || nonSDLAccounts == BigInt(0)) break
  }

  return { amountsToReceive, distributed: initialToDistribute - toDistribute }
}

/*
 * Distributes shares between accounts based on the data returned from getPrimaryDistributionAmounts
 * and getSecondaryDistributionAmounts. Also formats account data to store on IPFS and calculates a
 * new merkle root based on the data
 */
export function getNewTreeData(
  treeData: any,
  accounts: any,
  primaryDistributionAmounts: any,
  secondaryDistributionAmounts: any,
  totalAmountDistributed: any,
  sharesToDistribute: any
): { newTreeData: any; newMerkleRoot: any; totalSharesDistributed: any } {
  const newTreeData: any = {}
  let totalSharesDistributed = BigInt(0)

  for (let i = 0; i < accounts.length; i++) {
    let account = accounts[i]

    let oldAmount = BigInt(treeData[account]?.amount || 0)
    let oldSharesAmount = BigInt(treeData[account]?.sharesAmount || 0)

    let amount = primaryDistributionAmounts[i] + secondaryDistributionAmounts[i]
    let sharesAmount: any = (sharesToDistribute * amount) / totalAmountDistributed

    totalSharesDistributed += sharesAmount

    newTreeData[account] = {
      amount: (oldAmount + amount).toString(),
      sharesAmount: (oldSharesAmount + sharesAmount).toString(),
    }
  }

  let tree = StandardMerkleTree.of(
    accounts.map((account: any) => [
      account,
      newTreeData[account].amount,
      newTreeData[account].sharesAmount,
    ]),
    ['address', 'uint256', 'uint256']
  )

  return { newTreeData, newMerkleRoot: tree.root, totalSharesDistributed }
}

async function main() {
  const rpcUrl = process.env.RPC_URL
  const distributionBlockNumber: any = process.env.BLOCK_NUMBER

  if (rpcUrl == undefined) throw Error('Must set RPC_URL')
  if (distributionBlockNumber == undefined) throw Error('Must set BLOCK_NUMBER')

  const provider = new ethers.JsonRpcProvider(rpcUrl, CHAIN_ID, {
    batchMaxSize: 1,
  })
  const priorityPool = new ethers.Contract(
    PRIORITY_POOL_CONTRACT_ADDRESS,
    PriorityPoolABI,
    provider
  )
  const distributionOracle = new ethers.Contract(
    DISTRIBUTION_ORACLE_CONTRACT_ADDRESS,
    DistributionOracleABI,
    provider
  )

  const blockNumber = (
    await distributionOracle.updateStatus({
      blockTag: distributionBlockNumber - 1,
    })
  )[1]

  const [toDistribute, sharesToDistribute] = (
    await priorityPool.getDepositsSinceLastUpdate({ blockTag: blockNumber })
  ).map((v: any) => BigInt(v))
  if (toDistribute < BigInt(1e18)) {
    throw Error('Nothing to distribute')
  }

  const ipfsHash = await priorityPool.ipfsHash({ blockTag: blockNumber })
  const merkleRoot = await priorityPool.merkleRoot({ blockTag: blockNumber })
  const accountData = await priorityPool.getAccountData({ blockTag: blockNumber })

  let treeData: any = {}

  if (ipfsHash != ethers.zeroPadBytes('0x', 32)) {
    let res: any = await axios.request({
      method: 'get',
      baseURL: IPFS_GATEWAY_URL,
      url: `/${base58.encode(Buffer.from('1220' + ipfsHash.slice(2), 'hex'))}`,
    })
    const data = JSON.parse(res.data)
    if (data.merkleRoot != merkleRoot) {
      throw Error('Merkle roots do not match')
    }
    treeData = data.data
  }

  const { qTokenBalances, reSDLBalances, reSDLTotal, nonSDLAccounts } = getAccountBalances(
    treeData,
    accountData
  )

  const primaryDistributionData = getPrimaryDistributionAmounts(
    qTokenBalances,
    reSDLBalances,
    reSDLTotal,
    toDistribute
  )

  const secondaryDistributionData = getSecondaryDistributionAmounts(
    qTokenBalances,
    reSDLBalances,
    nonSDLAccounts,
    toDistribute - primaryDistributionData.distributed
  )

  const totalAmountDistributed =
    primaryDistributionData.distributed + secondaryDistributionData.distributed

  if (totalAmountDistributed > toDistribute) {
    throw Error('Distributed more than possible')
  }

  const actualSharesToDistribute = (sharesToDistribute * totalAmountDistributed) / toDistribute
  const { newTreeData, newMerkleRoot, totalSharesDistributed } = getNewTreeData(
    treeData,
    accountData[0],
    primaryDistributionData.amountsToReceive,
    secondaryDistributionData.amountsToReceive,
    totalAmountDistributed,
    actualSharesToDistribute
  )

  if (totalSharesDistributed > actualSharesToDistribute) {
    throw Error('Distributed more shares than possible')
  }

  const accounts = accountData[0]

  if (Object.keys(newTreeData).length != accounts.length) {
    throw Error('Invalid merkle tree')
  }

  for (let i = 0; i < accounts.length; i++) {
    let account = accounts[i]
    let amount = BigInt(newTreeData[account].amount)
    let queuedBalance = BigInt(accountData[2][i])
    let oldAmount = BigInt(treeData[account]?.amount || 0)

    if (amount > queuedBalance || amount < oldAmount) {
      throw Error('Invalid merkle tree')
    }
  }

  const result = {
    blockNumber: blockNumber.toString(),
    amountDistributed: totalAmountDistributed.toString(),
    sharesDistributed: totalSharesDistributed.toString(),
    data: {
      merkleRoot: newMerkleRoot,
      data: newTreeData,
    },
  }

  fse.outputJSONSync(`scripts/verify-distribution-output.json`, result, { spaces: 2 })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
