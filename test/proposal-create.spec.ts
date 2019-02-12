import { first } from 'rxjs/operators'
import { Arc } from '../src/arc'
import { Logger } from '../src/logger'
import { Proposal, ProposalStage } from '../src/proposal'
import {
  getArc,
  getTestDAO,
  graphqlHttpProvider,
  graphqlWsProvider,
  waitUntilTrue,
  web3HttpProvider,
  web3WsProvider
} from './utils'

Logger.setLevel(Logger.OFF)

describe('Create a ContributionReward proposal', () => {
  let arc: Arc
  let web3: any
  let accounts: any

  beforeAll(async () => {
    arc = getArc()
    web3 = arc.web3
    accounts = web3.eth.accounts.wallet
    web3.eth.defaultAccount = accounts[0].address
  })

  it('is properly indexed', async () => {
    const dao = await getTestDAO()
    const options = {
      beneficiary: '0xffcf8fdee72ac11b5c542428b35eef5769c409f0',
      ethReward: 300,
      externalTokenAddress: undefined,
      externalTokenReward: 0,
      nativeTokenReward: 1,
      periodLength: 12,
      periods: 5,
      type: 'ContributionReward'
    }

    const response = await dao.createProposal(options).send()
    const proposal = response.result as Proposal
    let proposals: Proposal[] = []
    const proposalIsIndexed = async () => {
      // we pass no-cache to make sure we hit the server on each request
      proposals = await Proposal.search({id: proposal.id}, arc, { fetchPolicy: 'no-cache' })
        .pipe(first()).toPromise()
      return proposals.length > 0
    }
    await waitUntilTrue(proposalIsIndexed)

    expect(proposal.id).toBeDefined()
    const proposalState = await proposal.state.pipe(first()).toPromise()

    expect(proposalState).toMatchObject({
      beneficiary: options.beneficiary,
      ethReward: options.ethReward,
      executedAt: null,
      externalTokenReward: 0,
      proposer: dao.context.web3.eth.defaultAccount.toLowerCase(),
      quietEndingPeriodBeganAt: null,
      reputationReward: 0,
      resolvedAt: null,
      stage: ProposalStage.Queued,
      stakesAgainst: 100000000000,
      stakesFor: 0
    })
    expect(proposalState.dao.address).toEqual(dao.address)

  })

  it('saves title etc on ipfs', async () => {
    const dao = await getTestDAO()
    const options = {
      beneficiary: '0xffcf8fdee72ac11b5c542428b35eef5769c409f0',
      description: 'Just eat them',
      ethReward: 300,
      externalTokenAddress: undefined,
      externalTokenReward: 0,
      nativeTokenReward: 1,
      periodLength: 12,
      periods: 5,
      title: 'A modest proposal',
      type: 'ContributionReward',
      url: 'http://swift.org/modest'
    }

    const response = await dao.createProposal(options).send()
    const proposal = response.result as Proposal
    let proposals: Proposal[] = []
    const proposalIsIndexed = async () => {
      // we pass no-cache to make sure we hit the server on each request
      proposals = await Proposal.search({id: proposal.id}, arc, { fetchPolicy: 'no-cache' })
        .pipe(first()).toPromise()
      return proposals.length > 0
    }
    await waitUntilTrue(proposalIsIndexed)
    const proposal2 = new Proposal(proposal.id, proposal.dao.address, arc)
    const proposalState = await proposal2.state.pipe(first()).toPromise()
    expect(proposalState.descriptionHash).toEqual('QmRg47CGnf8KgqTZheTejowoxt4SvfZFqi7KGzr2g163uL')

    // get the data
    // TODO - do the round trip test to see if subgraph properly indexs the fields
    // (depends on https://github.com/daostack/subgraph/issues/42)
    const savedData = await arc.ipfs.cat(proposalState.descriptionHash) // + proposalState.descriptionHash)
    expect(JSON.parse(savedData.toString())).toEqual({
      description: options.description,
      title: options.title,
      url: options.url
    })

  })
  it('handles the fact that the ipfs url is not set elegantly', async () => {
    const arcWithoutIPFS = new Arc({
      graphqlHttpProvider,
      graphqlWsProvider,
      ipfsProvider: '',
      web3HttpProvider,
      web3WsProvider
    })

    const dao = arcWithoutIPFS.dao('0xnotfound')
    const options = {
      beneficiary: '0xffcf8fdee72ac11b5c542428b35eef5769c409f0',
      description: 'Just eat them',
      ethReward: 300,
      externalTokenAddress: undefined,
      nativeTokenReward: 1,
      periodLength: 12,
      periods: 5,
      title: 'A modest proposal',
      type: 'ContributionReward',
      url: 'http://swift.org/modest'
    }

    expect(() => dao.createProposal(options)).toThrowError(
      /no ipfsProvider set/i
    )
  })
})