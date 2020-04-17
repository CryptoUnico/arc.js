import { first } from 'rxjs/operators'
import { Arc } from '../src/arc'
import { DAO } from '../src/dao'
import { IProposalOutcome, Proposal, ContributionRewardProposal } from '../src/'
import { Vote } from '../src/vote'
import { createAProposal, firstResult,
  getTestAddresses, getTestDAO, ITestAddresses,
  newArc, waitUntilTrue } from './utils'

jest.setTimeout(60000)

describe('Vote on a ContributionReward', () => {

  let arc: Arc
  let addresses: ITestAddresses
  let dao: DAO
  let executedProposal: ContributionRewardProposal

  beforeAll(async () => {
    arc = await newArc()
    addresses = await getTestAddresses()
    dao = await getTestDAO()
    const { executedProposalId } = addresses
    executedProposal = new ContributionRewardProposal(arc, executedProposalId)
    await executedProposal.fetchState()
  })

  it('works and gets indexed', async () => {
    const proposal = await createAProposal()
    const voteResponse = await proposal.vote(IProposalOutcome.Pass).send()
    const voteState0 = (voteResponse.result as Vote).coreState
    expect(voteState0).toMatchObject({
      outcome : IProposalOutcome.Pass
    })

    let votes: Vote[] = []

    const voteIsIndexed = async () => {
      // we pass no-cache to make sure we hit the server on each request
      votes = await Vote.search(arc, {where: {proposal: proposal.id}}, { fetchPolicy: 'no-cache' })
        .pipe(first()).toPromise()
      return votes.length > 0
    }
    await waitUntilTrue(voteIsIndexed)

    expect(votes.length).toEqual(1)
    const vote = votes[0]
    const voteState = await vote.fetchState()
    expect(voteState.proposal).toEqual(proposal.id)
    expect(voteState.outcome).toEqual(IProposalOutcome.Pass)
  })

  it('voting twice will not complain', async () => {
    const proposal = await createAProposal()
    await proposal.vote(IProposalOutcome.Pass).send()
    await proposal.vote(IProposalOutcome.Pass).send()
  })

  it('vote gets correctly indexed on the proposal entity', async () => {
    const proposal = await createAProposal()

    const voteHistory: Vote[][] = []
    proposal.votes().subscribe((next: Vote[]) => {
      voteHistory.push(next)
    })
    const lastVotes = () => {
      if (voteHistory.length > 0) {
       return voteHistory[voteHistory.length - 1]
     } else {
       return []
     }
    }
    await proposal.vote(IProposalOutcome.Pass).send()
    await waitUntilTrue(() => {
      const ls = lastVotes()
      return ls.length > 0
    })
    const state = await lastVotes()[0].fetchState()
    expect(state.outcome).toEqual(IProposalOutcome.Pass)
  })

  it('throws a meaningful error if the proposal does not exist', async () => {
    // a non-existing proposal
    const proposal = new ContributionRewardProposal(
      arc,
      '0x1aec6c8a3776b1eb867c68bccc2bf8b1178c47d7b6a5387cf958c7952da267c2',
    )

    if (!arc.web3) throw new Error('Web3 provider not set')
    proposal.context.defaultAccount = await arc.web3.getSigner(2).getAddress()
    await expect(proposal.vote(IProposalOutcome.Pass).send()).rejects.toThrow(
      /No proposal/i
    )
  })

  it('throws a meaningful error if the proposal was already executed', async () => {

    await expect(executedProposal.execute().send()).rejects.toThrow(
      // TODO: uncomment when Ethers.js supports revert reasons, see thread:
      // https://github.com/ethers-io/ethers.js/issues/446
      // /already executed/i
      /transaction: revert/i
    )

    await expect(executedProposal.vote(IProposalOutcome.Pass).send()).rejects.toThrow(
      // TODO: uncomment when Ethers.js supports revert reasons, see thread:
      // https://github.com/ethers-io/ethers.js/issues/446
      // /already executed/i
      /transaction: revert/i
    )
  })

  it('handles the case of voting without reputation nicely', async () => {
    // TODO: write this test!
    const proposal = await createAProposal()
    if (!arc.web3) throw new Error('Web3 provider not set')
    const accounts = await arc.web3.listAccounts()
    const accountWithNoRep = accounts[6]
    const reputation = await firstResult(dao.nativeReputation())
    const balance = await firstResult(reputation.reputationOf(accountWithNoRep))
    expect(balance.toString()).toEqual('0')
    arc.setAccount(accountWithNoRep) // a fake address
    await proposal.vote(IProposalOutcome.Pass)
    arc.setAccount(accounts[0])
  })

})
