const { ethErrorReason } = require('@omisego/omg-js-util')

interface SendTxInterface {
  readonly web3: any,
  txDetails: TransactionOptions,
  readonly privateKey?: string,
  callbacks?: {
    onReceipt: (receipt: object) => void,
    onConfirmation: (confirmation: object) => void
  }
}

export interface TransactionOptions {
  readonly from: string,
  gas?: number,
  gasPrice?: string,
  privateKey?: string
}

export interface TransactionReceipt {
  transactionHash: string
}

/**
 * Send transaction using web3
 *
 * @method sendTx
 * @private
 * @param web3 the web3 object to access the Ethereum network
 * @param {object} txDetails transaction details object
 * @param {string} privateKey private key
 * @param {{ onReceipt: any, onConfirmation: any }} [callbacks] callbacks to use during transaction lifecycle
 * @return {Promise<{ transactionHash: string }>} promise that resolves with the transaction hash
 */
async function sendTx ({ web3, txDetails, privateKey, callbacks }: SendTxInterface): Promise<TransactionReceipt> {
  await setGas(web3, txDetails)
  if (!privateKey) {
    // No privateKey, caller will handle signing if necessary
    if (web3.version.api && web3.version.api.startsWith('0.2')) {
      return new Promise((resolve, reject) => {
        web3.eth.sendTransaction(txDetails, (err, transactionHash) => {
          err
            ? reject(err)
            : resolve({ transactionHash })
        })
      })
    }
    if (callbacks) {
      return new Promise((resolve, reject) => {
        web3.eth.sendTransaction(txDetails)
          .on('receipt', callbacks.onReceipt)
          .on('confirmation', callbacks.onConfirmation)
          .on('transactionHash', hash => resolve({ transactionHash: hash }))
          .on('error', reject)
      })
    }
    return web3.eth.sendTransaction(txDetails)
  }

  // First sign the transaction
  const signedTx = await web3.eth.accounts.signTransaction(txDetails, prefixHex(privateKey))
  // Then send it
  if (callbacks) {
    return new Promise((resolve, reject) => {
      web3.eth.sendSignedTransaction(signedTx.rawTransaction)
        .on('receipt', callbacks.onReceipt)
        .on('confirmation', callbacks.onConfirmation)
        .on('transactionHash', hash => resolve({ transactionHash: hash }))
        .on('error', reject)
    })
  }
  return web3.eth.sendSignedTransaction(signedTx.rawTransaction).catch(err => {
    let transactionHash
    try {
      transactionHash = JSON.parse(err.message.replace('Transaction has been reverted by the EVM:', '')).transactionHash
    } catch (parseError) {
      throw (err)
    }
    ethErrorReason({ web3, hash: transactionHash }).then(() => {
      throw (err)
    })
  })
}

async function setGas (web3, txDetails) {
  if (!txDetails.gasPrice) {
    try {
      if (web3.version.api && web3.version.api.startsWith('0.2')) {
        txDetails.gasPrice = await new Promise((resolve, reject) => {
          web3.eth.getGasPrice((err, result) => {
            if (err) {
              reject(err)
            } else {
              resolve(result)
            }
          })
        })
      } else {
        txDetails.gasPrice = await web3.eth.getGasPrice()
      }
    } catch (err) {
      txDetails.gasPrice = '1000000000' // Default to 1 GWEI
    }
  }
  if (!txDetails.gas) {
    try {
      if (web3.version.api && web3.version.api.startsWith('0.2')) {
        txDetails.gas = await new Promise((resolve, reject) => {
          web3.eth.estimateGas(txDetails, (err, result) => {
            if (err) {
              reject(err)
            } else {
              resolve(result)
            }
          })
        })
      } else {
        txDetails.gas = await web3.eth.estimateGas(txDetails)
      }
    } catch (err) {
      console.warn(`Error estimating gas: ${err}`)
    }
  }
}

function getTxData (web3, contract, method, ...args) {
  if (web3.version.api && web3.version.api.startsWith('0.2')) {
    return contract[method].getData(...args)
  } else {
    return contract.methods[method](...args).encodeABI()
  }
}

function int192toHex (int192) {
  if (typeof int192 === 'string') {
    return int192.startsWith('0x') ? int192 : `0x${int192}`
  } else {
    return `0x${int192.toString(16)}`
  }
}

function prefixHex (hexString) {
  return hexString.startsWith('0x') ? hexString : `0x${hexString}`
}

export default {
  sendTx,
  setGas,
  getTxData,
  int192toHex
}