import { ethers } from 'ethers'
import { StandardMerkleTree } from '@openzeppelin/merkle-tree'
import {
  getAccountBalances,
  getPrimaryDistributionAmounts,
  getSecondaryDistributionAmounts,
  getNewTreeData,
} from '../src/endpoint/merkle'

const nzAccounts = [
  '0x8d4029D1259b75Cd9EBd851aa011e51e191Cf5F4',
  '0xf60774Fae78235b0C9D7318D9e4470BbAE54F59E',
  '0xdDa3182C712Ea73CdC503cC7d931Fddad730d9BD',
  '0x14f0D75D770D41af76C3D7eE5362aeE61456B81B',
  //'0xFf15dde830c54eEAA5A0Dd5DeD9772A50155B804',
  //'0xd6306735A345dB6efC47cC818Cbd32C5bB1b3708',
  //'0x235EEb5a5f34433B2981b4dc6D6341D74De44C16',
  //'0xf816609cF9c66C85c5cA54831286493EEA111abB',
  //'0x288E83bc3d5A5C2B03381E5c3D9505cc9DE1A338',
]

const accounts = ['0x0000000000000000000000000000000000000000', ...nzAccounts]

describe('queue algorithm', () => {
  describe('getAccountBalances should work correctly', () => {
    let reSDLBalanceData
    let queuedBalanceData

    beforeEach(async () => {
      reSDLBalanceData = [BigInt(0).toString()]
      queuedBalanceData = [BigInt(0).toString()]
    })

    it('empty tree data', async () => {
      nzAccounts.forEach((_, index) => reSDLBalanceData.push((index * 1e18).toString()))
      nzAccounts.forEach((_, index) => queuedBalanceData.push(((index + 1) * 1e18).toString()))
      expect(getAccountBalances({}, [accounts, reSDLBalanceData, queuedBalanceData])).toEqual({
        qTokenBalances: queuedBalanceData.map((v) => BigInt(v)),
        reSDLBalances: reSDLBalanceData.map((v) => BigInt(v)),
        reSDLTotal: BigInt(6 * 1e18),
        nonSDLAccounts: BigInt(1),
      })
    })

    it('existing tree data', async () => {
      let treeData = {
        [nzAccounts[0]]: {
          amount: BigInt(2 * 1e18).toString(),
          sharesAmount: BigInt(1 * 1e18).toString(),
        },
        [nzAccounts[1]]: {
          amount: BigInt(3 * 1e18).toString(),
          sharesAmount: BigInt(1.5 * 1e18).toString(),
        },
      }
      nzAccounts.forEach((_, index) => reSDLBalanceData.push((index * 1e18).toString()))
      nzAccounts.forEach((_, index) => queuedBalanceData.push((index * 10 * 1e18).toString()))
      expect(getAccountBalances(treeData, [accounts, reSDLBalanceData, queuedBalanceData])).toEqual(
        {
          qTokenBalances: [
            ...queuedBalanceData.map((v, index) => {
              if (index == 1) {
                return BigInt(v) - BigInt(2 * 1e18)
              } else if (index == 2) {
                return BigInt(v) - BigInt(3 * 1e18)
              }
              return BigInt(v)
            }),
          ],
          reSDLBalances: reSDLBalanceData.map((v) => BigInt(v)),
          reSDLTotal: BigInt(6 * 1e18),
          nonSDLAccounts: BigInt(1),
        }
      )
    })

    it('reSDLTotal should ignore accounts with 0 queued token', async () => {
      nzAccounts.forEach((_, index) => reSDLBalanceData.push((index * 1e18).toString()))
      nzAccounts.forEach((_, index) =>
        queuedBalanceData.push(((index % 2 == 0 ? 0 : index) * 1e18).toString())
      )
      expect(getAccountBalances({}, [accounts, reSDLBalanceData, queuedBalanceData])).toEqual({
        qTokenBalances: queuedBalanceData.map((v) => BigInt(v)),
        reSDLBalances: reSDLBalanceData.map((v) => BigInt(v)),
        reSDLTotal: BigInt(4 * 1e18),
        nonSDLAccounts: BigInt(0),
      })
    })

    it('nonSDLAccounts should ignore accounts with 0 queued token', async () => {
      nzAccounts.forEach((_, index) => reSDLBalanceData.push((0).toString()))
      nzAccounts.forEach((_, index) =>
        queuedBalanceData.push(((index % 2 == 0 ? 0 : index) * 1e18).toString())
      )
      expect(getAccountBalances({}, [accounts, reSDLBalanceData, queuedBalanceData])).toEqual({
        qTokenBalances: queuedBalanceData.map((v) => BigInt(v)),
        reSDLBalances: reSDLBalanceData.map((v) => BigInt(v)),
        reSDLTotal: BigInt(0),
        nonSDLAccounts: BigInt(2),
      })
    })
  })

  describe('getNewTreeData should work correctly', () => {
    it('empty tree data', async () => {
      let primaryDistributionAmounts = [
        BigInt(0),
        BigInt(10 * 1e18),
        BigInt(20 * 1e18),
        BigInt(0),
        BigInt(0),
      ]
      let secondaryDistributionAmounts = [
        BigInt(0),
        BigInt(0),
        BigInt(0),
        BigInt(0),
        BigInt(50 * 1e18),
      ]
      let treeData = accounts.map((account, index) => {
        let amount = primaryDistributionAmounts[index] + secondaryDistributionAmounts[index]
        let sharesAmount = amount / BigInt(2)
        return [account, amount, sharesAmount]
      })
      let tree = StandardMerkleTree.of(treeData, ['address', 'uint256', 'uint256'])
      expect(
        getNewTreeData(
          {},
          accounts,
          primaryDistributionAmounts,
          secondaryDistributionAmounts,
          BigInt(80 * 1e18),
          BigInt(40 * 1e18)
        )
      ).toEqual({
        newTreeData: {
          [accounts[0]]: { amount: BigInt(0).toString(), sharesAmount: BigInt(0).toString() },
          [accounts[1]]: {
            amount: BigInt(10 * 1e18).toString(),
            sharesAmount: BigInt(5 * 1e18).toString(),
          },
          [accounts[2]]: {
            amount: BigInt(20 * 1e18).toString(),
            sharesAmount: BigInt(10 * 1e18).toString(),
          },
          [accounts[3]]: { amount: BigInt(0).toString(), sharesAmount: BigInt(0).toString() },
          [accounts[4]]: {
            amount: BigInt(50 * 1e18).toString(),
            sharesAmount: BigInt(25 * 1e18).toString(),
          },
        },
        newMerkleRoot: tree.root,
        totalSharesDistributed: BigInt(40 * 1e18),
      })
    })

    it('existing tree data', async () => {
      let primaryDistributionAmounts = [
        BigInt(0),
        BigInt(10 * 1e18),
        BigInt(20 * 1e18),
        BigInt(0),
        BigInt(0),
      ]
      let secondaryDistributionAmounts = [
        BigInt(0),
        BigInt(0),
        BigInt(0),
        BigInt(0),
        BigInt(50 * 1e18),
      ]
      let oldTreeData = {
        [accounts[1]]: {
          amount: BigInt(2 * 1e18).toString(),
          sharesAmount: BigInt(1 * 1e18).toString(),
        },
        [accounts[3]]: {
          amount: BigInt(3 * 1e18).toString(),
          sharesAmount: BigInt(1.5 * 1e18).toString(),
        },
      }
      let treeData = accounts.map((account, index) => {
        let amount = primaryDistributionAmounts[index] + secondaryDistributionAmounts[index]
        let sharesAmount = amount / BigInt(2)
        amount += BigInt(oldTreeData[account]?.amount || 0)
        sharesAmount += BigInt(oldTreeData[account]?.sharesAmount || 0)
        return [account, amount, sharesAmount]
      })
      let tree = StandardMerkleTree.of(treeData, ['address', 'uint256', 'uint256'])
      expect(
        getNewTreeData(
          oldTreeData,
          accounts,
          primaryDistributionAmounts,
          secondaryDistributionAmounts,
          BigInt(80 * 1e18),
          BigInt(40 * 1e18)
        )
      ).toEqual({
        newTreeData: {
          [accounts[0]]: { amount: BigInt(0).toString(), sharesAmount: BigInt(0).toString() },
          [accounts[1]]: {
            amount: BigInt(12 * 1e18).toString(),
            sharesAmount: BigInt(6 * 1e18).toString(),
          },
          [accounts[2]]: {
            amount: BigInt(20 * 1e18).toString(),
            sharesAmount: BigInt(10 * 1e18).toString(),
          },
          [accounts[3]]: {
            amount: BigInt(3 * 1e18).toString(),
            sharesAmount: BigInt(1.5 * 1e18).toString(),
          },
          [accounts[4]]: {
            amount: BigInt(50 * 1e18).toString(),
            sharesAmount: BigInt(25 * 1e18).toString(),
          },
        },
        newMerkleRoot: tree.root,
        totalSharesDistributed: BigInt(40 * 1e18),
      })
    })

    it('more shares distributed than tokens', async () => {
      let primaryDistributionAmounts = [
        BigInt(0),
        BigInt(10 * 1e18),
        BigInt(20 * 1e18),
        BigInt(0),
        BigInt(0),
      ]
      let secondaryDistributionAmounts = [
        BigInt(0),
        BigInt(0),
        BigInt(0),
        BigInt(0),
        BigInt(50 * 1e18),
      ]
      let treeData = accounts.map((account, index) => {
        let amount = primaryDistributionAmounts[index] + secondaryDistributionAmounts[index]
        let sharesAmount = (amount * BigInt(125)) / BigInt(100)
        return [account, amount, sharesAmount]
      })
      let tree = StandardMerkleTree.of(treeData, ['address', 'uint256', 'uint256'])
      expect(
        getNewTreeData(
          {},
          accounts,
          primaryDistributionAmounts,
          secondaryDistributionAmounts,
          BigInt(80 * 1e18),
          BigInt(100 * 1e18)
        )
      ).toEqual({
        newTreeData: {
          [accounts[0]]: { amount: BigInt(0).toString(), sharesAmount: BigInt(0).toString() },
          [accounts[1]]: {
            amount: BigInt(10 * 1e18).toString(),
            sharesAmount: BigInt(12.5 * 1e18).toString(),
          },
          [accounts[2]]: {
            amount: BigInt(20 * 1e18).toString(),
            sharesAmount: BigInt(25 * 1e18).toString(),
          },
          [accounts[3]]: {
            amount: BigInt(0).toString(),
            sharesAmount: BigInt(0).toString(),
          },
          [accounts[4]]: {
            amount: BigInt(50 * 1e18).toString(),
            sharesAmount: BigInt(62.5 * 1e18).toString(),
          },
        },
        newMerkleRoot: tree.root,
        totalSharesDistributed: BigInt(100 * 1e18),
      })
    })

    it('account has very small amount to receive', async () => {
      let primaryDistributionAmounts = [
        BigInt(0),
        BigInt(10 * 1e18),
        BigInt(20 * 1e18),
        BigInt(0),
        BigInt(0),
      ]
      let secondaryDistributionAmounts = [
        BigInt(0),
        BigInt(0),
        BigInt(0),
        BigInt(10),
        BigInt(50 * 1e18),
      ]
      let treeData = accounts.map((account, index) => {
        let amount = primaryDistributionAmounts[index] + secondaryDistributionAmounts[index]
        let sharesAmount = amount / BigInt(2)
        return [account, amount, sharesAmount]
      })
      let tree = StandardMerkleTree.of(treeData, ['address', 'uint256', 'uint256'])

      expect(
        getNewTreeData(
          {},
          accounts,
          primaryDistributionAmounts,
          secondaryDistributionAmounts,
          BigInt(80 * 1e18) + BigInt(10),
          BigInt(40 * 1e18) + BigInt(5)
        )
      ).toEqual({
        newTreeData: {
          [accounts[0]]: { amount: BigInt(0).toString(), sharesAmount: BigInt(0).toString() },
          [accounts[1]]: {
            amount: BigInt(10 * 1e18).toString(),
            sharesAmount: BigInt(5 * 1e18).toString(),
          },
          [accounts[2]]: {
            amount: BigInt(20 * 1e18).toString(),
            sharesAmount: BigInt(10 * 1e18).toString(),
          },
          [accounts[3]]: {
            amount: BigInt(10).toString(),
            sharesAmount: BigInt(5).toString(),
          },
          [accounts[4]]: {
            amount: BigInt(50 * 1e18).toString(),
            sharesAmount: BigInt(25 * 1e18).toString(),
          },
        },
        newMerkleRoot: tree.root,
        totalSharesDistributed: BigInt(40 * 1e18) + BigInt(5),
      })
    })
  })

  describe('getPrimaryDistributionAmounts should work correctly', () => {
    it('every account has 0 reSDL', async () => {
      let qTokenBalances = [BigInt(0), BigInt(10 * 1e18), BigInt(20 * 1e18), BigInt(0), BigInt(0)]
      let reSDLBalances = [BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)]
      let reSDLTotal = BigInt(0)
      let toDistribute = BigInt(10 * 1e18)

      expect(
        getPrimaryDistributionAmounts(qTokenBalances, reSDLBalances, reSDLTotal, toDistribute)
      ).toEqual({
        amountsToReceive: [BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)],
        distributed: BigInt(0),
      })
    })

    it('every account has 0 queued tokens', async () => {
      let qTokenBalances = [BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)]
      let reSDLBalances = [BigInt(0), BigInt(10 * 1e18), BigInt(0), BigInt(20 * 1e18), BigInt(0)]
      let reSDLTotal = BigInt(30 * 1e18)
      let toDistribute = BigInt(10 * 1e18)

      expect(
        getPrimaryDistributionAmounts(qTokenBalances, reSDLBalances, reSDLTotal, toDistribute)
      ).toEqual({
        amountsToReceive: [BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)],
        distributed: BigInt(0),
      })
    })

    it('toDistribute is < 1', async () => {
      let qTokenBalances = [
        BigInt(0),
        BigInt(10 * 1e18),
        BigInt(20 * 1e18),
        BigInt(30 * 1e18),
        BigInt(0),
      ]
      let reSDLBalances = [BigInt(0), BigInt(10 * 1e18), BigInt(20 * 1e18), BigInt(0), BigInt(0)]
      let reSDLTotal = BigInt(0)
      let toDistribute = BigInt(0.999 * 1e18)

      expect(
        getPrimaryDistributionAmounts(qTokenBalances, reSDLBalances, reSDLTotal, toDistribute)
      ).toEqual({
        amountsToReceive: [BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)],
        distributed: BigInt(0),
      })
    })

    it('accounts are all allocated less LSD tokens than their queued amount', async () => {
      let qTokenBalances = [
        BigInt(0),
        BigInt(10 * 1e18),
        BigInt(20 * 1e18),
        BigInt(BigInt(30 * 1e18)),
        BigInt(0),
      ]
      let reSDLBalances = [
        BigInt(0),
        BigInt(10 * 1e18),
        BigInt(20 * 1e18),
        BigInt(0),
        BigInt(40 * 1e18),
      ]
      let reSDLTotal = BigInt(30 * 1e18)
      let toDistribute = BigInt(12 * 1e18)

      let data = getPrimaryDistributionAmounts(
        qTokenBalances,
        reSDLBalances,
        reSDLTotal,
        toDistribute
      )

      expect(data.amountsToReceive.map((d) => BigInt(Math.round(Number(d))))).toEqual([
        BigInt(0),
        BigInt(4 * 1e18),
        BigInt(8 * 1e18),
        BigInt(0),
        BigInt(0),
      ])
      expect(data.distributed).toEqual(
        data.amountsToReceive.reduce((sum, cur) => sum + cur, BigInt(0))
      )
    })

    it('some accounts are allocated more LSD tokens than their queued amount', async () => {
      let qTokenBalances = [
        BigInt(0),
        BigInt(3 * 1e18),
        BigInt(20 * 1e18),
        BigInt(BigInt(30 * 1e18)),
        BigInt(0),
      ]
      let reSDLBalances = [
        BigInt(0),
        BigInt(10 * 1e18),
        BigInt(20 * 1e18),
        BigInt(0),
        BigInt(40 * 1e18),
      ]
      let reSDLTotal = BigInt(30 * 1e18)
      let toDistribute = BigInt(12 * 1e18)

      let data = getPrimaryDistributionAmounts(
        qTokenBalances,
        reSDLBalances,
        reSDLTotal,
        toDistribute
      )

      expect(data.amountsToReceive.map((d) => BigInt(Math.round(Number(d))))).toEqual([
        BigInt(0),
        BigInt(3 * 1e18),
        BigInt(9 * 1e18),
        BigInt(0),
        BigInt(0),
      ])
      expect(data.distributed).toEqual(
        data.amountsToReceive.reduce((sum, cur) => sum + cur, BigInt(0))
      )
    })

    it('all accounts are allocated their full queued amount and there is left over to distribute', async () => {
      let qTokenBalances = [
        BigInt(0),
        BigInt(10 * 1e18),
        BigInt(20 * 1e18),
        BigInt(BigInt(30 * 1e18)),
        BigInt(0),
      ]
      let reSDLBalances = [
        BigInt(0),
        BigInt(10 * 1e18),
        BigInt(20 * 1e18),
        BigInt(0),
        BigInt(40 * 1e18),
      ]
      let reSDLTotal = BigInt(30 * 1e18)
      let toDistribute = BigInt(133 * 1e18)

      let data = getPrimaryDistributionAmounts(
        qTokenBalances,
        reSDLBalances,
        reSDLTotal,
        toDistribute
      )

      expect(data.amountsToReceive.map((d) => BigInt(Math.round(Number(d))))).toEqual([
        BigInt(0),
        BigInt(10 * 1e18),
        BigInt(20 * 1e18),
        BigInt(0),
        BigInt(0),
      ])
      expect(data.distributed).toEqual(BigInt(30 * 1e18))
    })

    it('account with very small reSDL balance', async () => {
      let qTokenBalances = [
        BigInt(0),
        BigInt(10 * 1e18),
        BigInt(20 * 1e18),
        BigInt(BigInt(30 * 1e18)),
        BigInt(0),
      ]
      let reSDLBalances = [BigInt(0), BigInt(100), BigInt(20 * 1e18), BigInt(0), BigInt(40 * 1e18)]
      let reSDLTotal = BigInt(20 * 1e18) + BigInt(100)
      let toDistribute = BigInt(20 * 1e18)

      let data = getPrimaryDistributionAmounts(
        qTokenBalances,
        reSDLBalances,
        reSDLTotal,
        toDistribute
      )

      expect(data.amountsToReceive.map((d) => BigInt(Math.round(Number(d))))).toEqual([
        BigInt(0),
        BigInt(99),
        BigInt(20 * 1e18),
        BigInt(0),
        BigInt(0),
      ])
      expect(BigInt(Math.round(Number(data.distributed)))).toEqual(BigInt(20 * 1e18))
    })
  })

  describe('getSecondaryDistributionAmounts should work correctly', () => {
    it('every account has reSDL', async () => {
      let qTokenBalances = [BigInt(0), BigInt(10 * 1e18), BigInt(20 * 1e18), BigInt(0), BigInt(0)]
      let reSDLBalances = [BigInt(1), BigInt(2), BigInt(3), BigInt(4), BigInt(5)]
      let nonSDLAccounts = BigInt(0)
      let toDistribute = BigInt(10 * 1e18)

      expect(
        getSecondaryDistributionAmounts(qTokenBalances, reSDLBalances, nonSDLAccounts, toDistribute)
      ).toEqual({
        amountsToReceive: [BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)],
        distributed: BigInt(0),
      })
    })

    it('every account has 0 queued tokens', async () => {
      let qTokenBalances = [BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)]
      let reSDLBalances = [BigInt(0), BigInt(10 * 1e18), BigInt(0), BigInt(20 * 1e18), BigInt(0)]
      let nonSDLAccounts = BigInt(2)
      let toDistribute = BigInt(10 * 1e18)

      expect(
        getSecondaryDistributionAmounts(qTokenBalances, reSDLBalances, nonSDLAccounts, toDistribute)
      ).toEqual({
        amountsToReceive: [BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)],
        distributed: BigInt(0),
      })
    })

    it('toDistribute is < 1', async () => {
      let qTokenBalances = [
        BigInt(0),
        BigInt(10 * 1e18),
        BigInt(20 * 1e18),
        BigInt(0),
        BigInt(40 * 1e18),
      ]
      let reSDLBalances = [BigInt(0), BigInt(10 * 1e18), BigInt(0), BigInt(20 * 1e18), BigInt(0)]
      let nonSDLAccounts = BigInt(2)
      let toDistribute = BigInt(0.999 * 1e18)

      expect(
        getSecondaryDistributionAmounts(qTokenBalances, reSDLBalances, nonSDLAccounts, toDistribute)
      ).toEqual({
        amountsToReceive: [BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)],
        distributed: BigInt(0),
      })
    })

    it('accounts are all allocated less LSD tokens than their queued amount', async () => {
      let qTokenBalances = [
        BigInt(0),
        BigInt(10 * 1e18),
        BigInt(20 * 1e18),
        BigInt(30 * 1e18),
        BigInt(0),
      ]
      let reSDLBalances = [BigInt(0), BigInt(0), BigInt(20 * 1e18), BigInt(0), BigInt(40 * 1e18)]
      let nonSDLAccounts = BigInt(2)
      let toDistribute = BigInt(12 * 1e18)

      let data = getSecondaryDistributionAmounts(
        qTokenBalances,
        reSDLBalances,
        nonSDLAccounts,
        toDistribute
      )

      expect(data.amountsToReceive.map((d) => BigInt(Math.round(Number(d))))).toEqual([
        BigInt(0),
        BigInt(6 * 1e18),
        BigInt(0),
        BigInt(6 * 1e18),
        BigInt(0),
      ])
      expect(data.distributed).toEqual(BigInt(12 * 1e18))
    })

    it('some accounts are allocated more LSD tokens than their queued amount', async () => {
      let qTokenBalances = [
        BigInt(0),
        BigInt(10 * 1e18),
        BigInt(20 * 1e18),
        BigInt(30 * 1e18),
        BigInt(0),
      ]
      let reSDLBalances = [BigInt(0), BigInt(0), BigInt(20 * 1e18), BigInt(0), BigInt(40 * 1e18)]
      let nonSDLAccounts = BigInt(2)
      let toDistribute = BigInt(30 * 1e18)

      let data = getSecondaryDistributionAmounts(
        qTokenBalances,
        reSDLBalances,
        nonSDLAccounts,
        toDistribute
      )

      expect(data.amountsToReceive.map((d) => BigInt(Math.round(Number(d))))).toEqual([
        BigInt(0),
        BigInt(10 * 1e18),
        BigInt(0),
        BigInt(20 * 1e18),
        BigInt(0),
      ])
      expect(data.distributed).toEqual(BigInt(30 * 1e18))
    })

    it('all accounts are allocated their full queued amount and there is left over to distribute', async () => {
      let qTokenBalances = [
        BigInt(0),
        BigInt(10 * 1e18),
        BigInt(20 * 1e18),
        BigInt(30 * 1e18),
        BigInt(0),
      ]
      let reSDLBalances = [BigInt(0), BigInt(0), BigInt(20 * 1e18), BigInt(0), BigInt(40 * 1e18)]
      let nonSDLAccounts = BigInt(2)
      let toDistribute = BigInt(50 * 1e18)

      let data = getSecondaryDistributionAmounts(
        qTokenBalances,
        reSDLBalances,
        nonSDLAccounts,
        toDistribute
      )

      expect(data.amountsToReceive.map((d) => BigInt(Math.round(Number(d))))).toEqual([
        BigInt(0),
        BigInt(10 * 1e18),
        BigInt(0),
        BigInt(30 * 1e18),
        BigInt(0),
      ])
      expect(data.distributed).toEqual(BigInt(40 * 1e18))
    })
  })
})
