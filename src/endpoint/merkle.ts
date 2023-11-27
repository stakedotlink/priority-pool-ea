import { AdapterEndpoint } from '@chainlink/external-adapter-framework/adapter'
import { AdapterRequest, AdapterResponse } from '@chainlink/external-adapter-framework/util'
import { Requester } from '@chainlink/external-adapter-framework/util/requester'
import { Transport, TransportDependencies } from '@chainlink/external-adapter-framework/transports'
import { ResponseCache } from '@chainlink/external-adapter-framework/cache/response'
import { InputParameters } from '@chainlink/external-adapter-framework/validation'
import base58 from 'bs58'
import { ethers } from 'ethers'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import { config } from '../config'
import { PriorityPoolABI } from '../config/PriorityPoolABI'

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
      let reSDLBalance = reSDLBalances[i]
      if (qTokenBalance == BigInt(0) || reSDLBalance == BigInt(0)) continue

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

export const inputParameters = new InputParameters({
  blockNumber: {
    required: true,
    type: 'number',
    description: 'block number that the priority pool was paused',
  },
})

interface ResponseSchema {
  Data: {
    result: {
      merkleRoot: string
      ipfsHash: string
      amountDistributed: string
      sharesDistributed: string
    }
  }
  Result: null
}

export type BaseEndpointTypes = {
  Parameters: typeof inputParameters.definition
  Response: ResponseSchema
  Settings: typeof config.settings
}

class MerkleTransport implements Transport<BaseEndpointTypes> {
  name!: string
  responseCache!: ResponseCache<BaseEndpointTypes>
  requester!: Requester

  async initialize(
    dependencies: TransportDependencies<BaseEndpointTypes>,
    _: typeof config.settings,
    __: string,
    name: string
  ): Promise<void> {
    this.name = name
    this.responseCache = dependencies.responseCache
    this.requester = dependencies.requester
  }

  async foregroundExecute(
    req: AdapterRequest<typeof inputParameters.validated>,
    settings: typeof config.settings
  ): Promise<AdapterResponse<BaseEndpointTypes['Response']>> {
    const provider = new ethers.JsonRpcProvider(settings.RPC_URL, settings.CHAIN_ID, {
      batchMaxSize: 1,
    })
    const priorityPool = new ethers.Contract(
      settings.PRIORITY_POOL_CONTRACT_ADDRESS,
      PriorityPoolABI,
      provider
    )
    const blockNumber = req.requestContext.data.blockNumber
    const providerDataRequestedUnixMs = Date.now()

    const [toDistribute, sharesToDistribute] = (
      await priorityPool.getDepositsSinceLastUpdate({ blockTag: blockNumber })
    ).map((v: any) => BigInt(v))
    if (toDistribute < BigInt(1e18)) {
      return {
        statusCode: 500,
        errorMessage: 'Nothing to distribute',
        timestamps: {
          providerDataRequestedUnixMs,
          providerDataReceivedUnixMs: Date.now(),
          providerIndicatedTimeUnixMs: undefined,
        },
      }
    }

    const ipfsHash = await priorityPool.ipfsHash({ blockTag: blockNumber })
    const merkleRoot = await priorityPool.merkleRoot({ blockTag: blockNumber })
    const accountData = await priorityPool.getAccountData({ blockTag: blockNumber })

    let treeData: any = {}

    if (ipfsHash != ethers.zeroPadBytes('0x', 32)) {
      let res: any = await this.requester.request(ipfsHash, {
        method: 'get',
        baseURL: settings.PINATA_GATEWAY_URL,
        url: `/ipfs/${base58.encode(Buffer.from('1220' + ipfsHash.slice(2), 'hex'))}`,
      })
      const data = JSON.parse(res.response.data)
      if (data.merkleRoot != merkleRoot) {
        return {
          statusCode: 500,
          errorMessage: 'Merkle roots do not match',
          timestamps: {
            providerDataRequestedUnixMs,
            providerDataReceivedUnixMs: Date.now(),
            providerIndicatedTimeUnixMs: undefined,
          },
        }
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
      return {
        statusCode: 500,
        errorMessage: 'Distributed more than possible',
        timestamps: {
          providerDataRequestedUnixMs,
          providerDataReceivedUnixMs: Date.now(),
          providerIndicatedTimeUnixMs: undefined,
        },
      }
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
      return {
        statusCode: 500,
        errorMessage: 'Distributed more shares than possible',
        timestamps: {
          providerDataRequestedUnixMs,
          providerDataReceivedUnixMs: Date.now(),
          providerIndicatedTimeUnixMs: undefined,
        },
      }
    }

    const accounts = accountData[0]

    if (Object.keys(newTreeData).length != accounts.length) {
      return {
        statusCode: 500,
        errorMessage: 'Invalid merkle tree',
        timestamps: {
          providerDataRequestedUnixMs,
          providerDataReceivedUnixMs: Date.now(),
          providerIndicatedTimeUnixMs: undefined,
        },
      }
    }

    for (let i = 0; i < accounts.length; i++) {
      let account = accounts[i]
      let queuedBalance = BigInt(accountData[2][i])

      let amount = BigInt(newTreeData[account].amount)
      let oldAmount = BigInt(treeData[account]?.amount || 0)

      let sharesAmount = BigInt(newTreeData[account].sharesAmount)
      let oldSharesAmount = BigInt(treeData[account]?.sharesAmount || 0)

      if (amount > queuedBalance || amount < oldAmount || sharesAmount < oldSharesAmount) {
        return {
          statusCode: 500,
          errorMessage: 'Invalid merkle tree',
          timestamps: {
            providerDataRequestedUnixMs,
            providerDataReceivedUnixMs: Date.now(),
            providerIndicatedTimeUnixMs: undefined,
          },
        }
      }
    }

    const res: any = await this.requester.request(newMerkleRoot, {
      method: 'post',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + settings.PINATA_JWT,
      },
      baseURL: settings.PINATA_API_URL,
      url: '/pinning/pinJSONToIPFS',
      data: {
        pinataOptions: {
          cidVersion: 0,
        },
        pinataContent: JSON.stringify({
          merkleRoot: newMerkleRoot,
          data: newTreeData,
        }),
      },
    })

    const newIpfsCID = res.response.data.IpfsHash
    const newIpfsHash = '0x' + Buffer.from(base58.decode(newIpfsCID)).toString('hex').slice(4)

    const result = {
      merkleRoot: newMerkleRoot,
      ipfsHash: newIpfsHash,
      amountDistributed: totalAmountDistributed.toString(),
      sharesDistributed: totalSharesDistributed.toString(),
    }

    const response = {
      data: {
        result,
      },
      result: null,
      timestamps: {
        providerDataRequestedUnixMs,
        providerDataReceivedUnixMs: Date.now(),
        providerIndicatedTimeUnixMs: undefined,
      },
      statusCode: 200,
    }
    return response
  }
}

export const endpoint = new AdapterEndpoint({
  name: 'merkle',
  transport: new MerkleTransport(),
  inputParameters,
})
