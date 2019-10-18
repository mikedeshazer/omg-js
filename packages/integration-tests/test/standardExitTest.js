/*
Copyright 2018 OmiseGO Pte Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License. */

const config = require('../test-config')
const rcHelper = require('../helpers/rootChainHelper')
const ccHelper = require('../helpers/childChainHelper')
const faucet = require('../helpers/testFaucet')
const Web3 = require('web3')
const erc20abi = require('human-standard-token-abi')
const ChildChain = require('@omisego/omg-js-childchain')
const RootChain = require('@omisego/omg-js-rootchain')
const { transaction } = require('@omisego/omg-js-util')
const chai = require('chai')
const assert = chai.assert

const web3 = new Web3(new Web3.providers.HttpProvider(config.geth_url))
const childChain = new ChildChain(config.watcher_url, config.childchain_url)
let rootChain

// NB This test waits for at least RootChain.MIN_EXIT_PERIOD so it should be run against a
// modified RootChain contract with a shorter than normal MIN_EXIT_PERIOD.

describe.only('Standard Exit tests', async () => {
  before(async () => {
    const plasmaContract = await rcHelper.getPlasmaContractAddress(config)
    rootChain = new RootChain(web3, plasmaContract.contract_addr)
    await faucet.init(rootChain, childChain, web3, config)
  })

  describe('Deposit transaction exit (ci-enabled)', async () => {
    const INTIIAL_ALICE_AMOUNT = web3.utils.toWei('.1', 'ether')
    const DEPOSIT_AMOUNT = web3.utils.toWei('.0001', 'ether')
    let aliceAccount

    beforeEach(async () => {
      // Create and fund Alice's account
      aliceAccount = rcHelper.createAccount(web3)
      console.log(`Created Alice account ${JSON.stringify(aliceAccount)}`)
      await faucet.fundRootchainEth(web3, aliceAccount.address, INTIIAL_ALICE_AMOUNT)
      await rcHelper.waitForEthBalanceEq(web3, aliceAccount.address, INTIIAL_ALICE_AMOUNT)
    })

    afterEach(async () => {
      try {
        // Send any leftover funds back to the faucet
        await faucet.returnFunds(web3, aliceAccount)
      } catch (err) {
        console.warn(`Error trying to return funds to the faucet: ${err}`)
      }
    })

    it('should succesfully exit a deposit', async () => {
      // Alice deposits ETH into the Plasma contract
      let receipt = await rcHelper.depositEth(rootChain, childChain, aliceAccount.address, DEPOSIT_AMOUNT, aliceAccount.privateKey)
      await ccHelper.waitForBalanceEq(childChain, aliceAccount.address, DEPOSIT_AMOUNT)
      console.log(`Alice deposited ${DEPOSIT_AMOUNT} into RootChain contract`)

      // Keep track of how much Alice spends on gas
      let aliceSpentOnGas = await rcHelper.spentOnGas(web3, receipt)
      console.log(`aliceSpentOnGas = ${aliceSpentOnGas}`)

      // Alice wants to exit without having transacted on the childchain

      // Get Alice's deposit utxo
      const aliceUtxos = await childChain.getUtxos(aliceAccount.address)
      assert.equal(aliceUtxos.length, 1)
      assert.equal(aliceUtxos[0].amount.toString(), DEPOSIT_AMOUNT)

      // Get the exit data
      const utxoToExit = aliceUtxos[0]
      const exitData = await childChain.getExitData(utxoToExit)
      assert.hasAllKeys(exitData, ['txbytes', 'proof', 'utxo_pos'])

      receipt = await rootChain.startStandardExit(
        exitData.utxo_pos,
        exitData.txbytes,
        exitData.proof,
        {
          privateKey: aliceAccount.privateKey,
          from: aliceAccount.address
        }
      )
      console.log(`Alice called RootChain.startExit(): txhash = ${receipt.transactionHash}`)
      aliceSpentOnGas.iadd(await rcHelper.spentOnGas(web3, receipt))

      // Call processExits before the challenge period is over
      receipt = await rootChain.processExits(
        transaction.ETH_CURRENCY,
        0,
        1,
        {
          privateKey: aliceAccount.privateKey,
          from: aliceAccount.address
        }
      )
      console.log(`Alice called RootChain.processExits() before challenge period: txhash = ${receipt.transactionHash}`)
      aliceSpentOnGas.iadd(await rcHelper.spentOnGas(web3, receipt))

      // Get Alice's ETH balance
      let aliceEthBalance = await web3.eth.getBalance(aliceAccount.address)
      // Expect Alice's balance to be less than INTIIAL_ALICE_AMOUNT because the exit has not been processed yet
      assert.isBelow(Number(aliceEthBalance), Number(INTIIAL_ALICE_AMOUNT))

      // Wait for challenge period
      const toWait = await rcHelper.getTimeToExit(rootChain.plasmaContract, exitData.utxo_pos)
      console.log(`Waiting for challenge period... ${toWait}ms`)
      await rcHelper.sleep(toWait)

      // Call processExits again.
      receipt = await rootChain.processExits(
        transaction.ETH_CURRENCY,
        0,
        6,
        {
          privateKey: aliceAccount.privateKey,
          from: aliceAccount.address,
          gas: 200000
        }
      )
      console.log(`Alice called RootChain.processExits() after challenge period: txhash = ${receipt.transactionHash}`)
      aliceSpentOnGas.iadd(await rcHelper.spentOnGas(web3, receipt))

      // Get Alice's ETH balance
      aliceEthBalance = await web3.eth.getBalance(aliceAccount.address)
      // Expect Alice's balance to be INTIIAL_ALICE_AMOUNT + TRANSFER_AMOUNT - gas spent
      const expected = web3.utils.toBN(INTIIAL_ALICE_AMOUNT).sub(aliceSpentOnGas)
      assert.equal(aliceEthBalance.toString(), expected.toString())
    })
  })

  describe('childchain transaction exit (ci-enabled)', async () => {
    const INTIIAL_ALICE_AMOUNT = web3.utils.toWei('.001', 'ether')
    const INTIIAL_BOB_RC_AMOUNT = web3.utils.toWei('.1', 'ether')
    const TRANSFER_AMOUNT = web3.utils.toWei('0.0002', 'ether')
    let aliceAccount
    let bobAccount

    before(async () => {
      // Create Alice and Bob's accounts
      aliceAccount = rcHelper.createAccount(web3)
      console.log(`Created Alice account ${JSON.stringify(aliceAccount)}`)
      bobAccount = rcHelper.createAccount(web3)
      console.log(`Created Bob account ${JSON.stringify(bobAccount)}`)

      await Promise.all([
        // Give some ETH to Alice on the child chain
        faucet.fundChildchain(aliceAccount.address, INTIIAL_ALICE_AMOUNT, transaction.ETH_CURRENCY),
        // Give some ETH to Bob on the root chain
        faucet.fundRootchainEth(web3, bobAccount.address, INTIIAL_BOB_RC_AMOUNT)
      ])
      // Wait for finality
      await Promise.all([
        ccHelper.waitForBalanceEq(childChain, aliceAccount.address, INTIIAL_ALICE_AMOUNT),
        rcHelper.waitForEthBalanceEq(web3, bobAccount.address, INTIIAL_BOB_RC_AMOUNT)
      ])
    })

    after(async () => {
      try {
        // Send any leftover funds back to the faucet
        await faucet.returnFunds(web3, aliceAccount)
        await faucet.returnFunds(web3, bobAccount)
      } catch (err) {
        console.warn(`Error trying to return funds to the faucet: ${err}`)
      }
    })

    it('should succesfully exit a ChildChain transaction', async () => {
      // Send TRANSFER_AMOUNT from Alice to Bob
      await ccHelper.sendAndWait(
        childChain,
        aliceAccount.address,
        bobAccount.address,
        TRANSFER_AMOUNT,
        transaction.ETH_CURRENCY,
        aliceAccount.privateKey,
        TRANSFER_AMOUNT,
        rootChain.plasmaContractAddress
      )

      console.log(`Transferred ${TRANSFER_AMOUNT} from Alice to Bob`)

      // Bob wants to exit
      const bobUtxos = await childChain.getUtxos(bobAccount.address)
      assert.equal(bobUtxos.length, 1)
      assert.equal(bobUtxos[0].amount.toString(), TRANSFER_AMOUNT)

      // Get the exit data
      const utxoToExit = bobUtxos[0]
      const exitData = await childChain.getExitData(utxoToExit)
      assert.hasAllKeys(exitData, ['txbytes', 'sigs', 'proof', 'utxo_pos'])

      let receipt = await rootChain.startStandardExit(
        exitData.utxo_pos,
        exitData.txbytes,
        exitData.proof,
        {
          privateKey: bobAccount.privateKey,
          from: bobAccount.address
        }
      )
      console.log(`Bob called RootChain.startExit(): txhash = ${receipt.transactionHash}`)

      // Keep track of how much Bob spends on gas
      let bobSpentOnGas = await rcHelper.spentOnGas(web3, receipt)

      // Call processExits before the challenge period is over
      receipt = await rootChain.processExits(
        transaction.ETH_CURRENCY,
        0,
        1,
        {
          privateKey: bobAccount.privateKey,
          from: bobAccount.address
        }
      )
      console.log(`Bob called RootChain.processExits() before challenge period: txhash = ${receipt.transactionHash}`)
      bobSpentOnGas.iadd(await rcHelper.spentOnGas(web3, receipt))

      // Get Bob's ETH balance
      let bobEthBalance = await web3.eth.getBalance(bobAccount.address)
      // Expect Bob's balance to be less than INTIIAL_BOB_AMOUNT because the exit has not been processed yet
      assert.isBelow(Number(bobEthBalance), Number(INTIIAL_BOB_RC_AMOUNT))

      // Wait for challenge period
      const toWait = await rcHelper.getTimeToExit(rootChain.plasmaContract, exitData.utxo_pos)
      console.log(`Waiting for challenge period... ${toWait}ms`)
      await rcHelper.sleep(toWait)

      // Call processExits again.
      receipt = await rootChain.processExits(
        transaction.ETH_CURRENCY,
        0,
        1,
        {
          privateKey: bobAccount.privateKey,
          from: bobAccount.address,
          gas: 200000
        }
      )
      console.log(`Bob called RootChain.processExits() after challenge period: txhash = ${receipt.transactionHash}`)
      bobSpentOnGas.iadd(await rcHelper.spentOnGas(web3, receipt))

      // Get Bob's ETH balance
      bobEthBalance = await web3.eth.getBalance(bobAccount.address)
      // Expect Bob's balance to be INTIIAL_BOB_AMOUNT + TRANSFER_AMOUNT - gas spent
      const expected = web3.utils.toBN(INTIIAL_BOB_RC_AMOUNT)
        .add(web3.utils.toBN(TRANSFER_AMOUNT))
        .sub(bobSpentOnGas)
      assert.equal(bobEthBalance.toString(), expected.toString())
    })
  })

  describe('ERC20 exit (ci-enabled)', async () => {
    const ERC20_CURRENCY = config.testErc20Contract
    const testErc20Contract = new web3.eth.Contract(erc20abi, config.testErc20Contract)
    const INTIIAL_ALICE_AMOUNT_ETH = web3.utils.toWei('.1', 'ether')
    const INTIIAL_ALICE_AMOUNT_ERC20 = 2
    let aliceAccount

    before(async () => {
      // Create and fund Alice's account
      aliceAccount = rcHelper.createAccount(web3)
      console.log(`Created Alice account ${JSON.stringify(aliceAccount)}`)
      await Promise.all([
        faucet.fundChildchain(aliceAccount.address, INTIIAL_ALICE_AMOUNT_ERC20, ERC20_CURRENCY),
        faucet.fundRootchainEth(web3, aliceAccount.address, INTIIAL_ALICE_AMOUNT_ETH)
      ])

      await Promise.all([
        ccHelper.waitForBalanceEq(childChain, aliceAccount.address, INTIIAL_ALICE_AMOUNT_ERC20, ERC20_CURRENCY),
        rcHelper.waitForEthBalanceEq(web3, aliceAccount.address, INTIIAL_ALICE_AMOUNT_ETH)
      ])

      try {
        // Make sure the token has been added
        await rootChain.addToken(config.testErc20Contract, { from: aliceAccount.address, privateKey: aliceAccount.privateKey })
      } catch (err) {
        // addToken will revert if the token has already been added. Ignore it.
      }
    })

    after(async () => {
      try {
        // Send any leftover funds back to the faucet
        await faucet.returnFunds(web3, aliceAccount)
      } catch (err) {
        console.warn(`Error trying to return funds to the faucet: ${err}`)
      }
    })

    it('should exit ERC20 tokens', async () => {
      // Check utxos on the child chain
      const utxos = await childChain.getUtxos(aliceAccount.address)
      assert.equal(utxos.length, 1)
      assert.hasAllKeys(utxos[0], ['utxo_pos', 'txindex', 'owner', 'oindex', 'currency', 'blknum', 'amount'])
      assert.equal(utxos[0].amount, INTIIAL_ALICE_AMOUNT_ERC20)
      assert.equal(utxos[0].currency, ERC20_CURRENCY)

      // Get the exit data
      const utxoToExit = utxos[0]
      const exitData = await childChain.getExitData(utxoToExit)
      assert.hasAllKeys(exitData, ['txbytes', 'sigs', 'proof', 'utxo_pos'])

      let receipt = await rootChain.startStandardExit(
        exitData.utxo_pos,
        exitData.txbytes,
        exitData.proof,
        {
          privateKey: aliceAccount.privateKey,
          from: aliceAccount.address
        }
      )
      console.log(`Alice called RootChain.startExit(): txhash = ${receipt.transactionHash}`)

      // Call processExits before the challenge period is over
      receipt = await rootChain.processExits(
        config.testErc20Contract,
        0,
        1,
        {
          privateKey: aliceAccount.privateKey,
          from: aliceAccount.address
        }
      )
      console.log(`Alice called RootChain.processExits() before challenge period: txhash = ${receipt.transactionHash}`)
      let balance = await testErc20Contract.methods.balanceOf(aliceAccount.address).call({ from: aliceAccount.address })
      assert.equal(balance, 0)

      // Wait for challenge period
      const toWait = await rcHelper.getTimeToExit(rootChain.plasmaContract, exitData.utxo_pos)
      console.log(`Waiting for challenge period... ${toWait}ms`)
      await rcHelper.sleep(toWait)

      // Call processExits again.
      receipt = await rootChain.processExits(
        config.testErc20Contract,
        0,
        6,
        {
          privateKey: aliceAccount.privateKey,
          from: aliceAccount.address,
          gas: 200000
        }
      )
      console.log(`Alice called RootChain.processExits() after challenge period: txhash = ${receipt.transactionHash}`)
      balance = await testErc20Contract.methods.balanceOf(aliceAccount.address).call({ from: aliceAccount.address })
      assert.equal(balance, INTIIAL_ALICE_AMOUNT_ERC20)
    })
  })
})
