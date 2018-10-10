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

const { hash, signature, zeroSignature, singleSign } = require('../src/transaction/signature')
const mocha = require('mocha')
var assert = require('assert')
const describe = mocha.describe
const it = mocha.it

const hashedTx =
new Uint8Array([41, 144, 16, 100, 71, 248, 218, 223, 141, 45, 112, 193, 233, 207, 77, 182, 81,
  153, 105, 181, 171, 62, 167, 202, 94, 82, 96, 151, 227, 31, 188, 58])

let signedTX = [179, 94, 231, 66, 67, 197, 6, 211, 36, 81, 9, 117, 1, 211, 238, 69, 177, 3, 228, 171, 97, 165, 197, 31, 209, 88, 108, 120, 65, 230, 52, 74, 63, 4, 110, 246, 242, 89, 122, 159, 95, 101, 212, 72, 233, 97, 238, 18, 136, 144, 102, 46, 27, 27, 197, 86, 235, 175, 57, 173, 215, 8, 187, 44, 27]

const txInput =
new Uint8Array([141, 71, 59, 252, 39, 243, 159, 15, 219, 218, 102, 12, 86, 193, 183, 238, 72,
  224, 70, 252, 26, 46, 111, 176, 96, 198, 135, 5, 51, 164, 225, 234, 124, 176,
  154, 37, 151, 221, 232, 225, 107, 149, 50, 243, 63, 178, 96, 109, 176, 28, 48,
  135, 224, 35, 140, 220, 191, 244, 40, 136, 229, 155, 174, 223, 27])

let alicePriv = Buffer.from(new Uint8Array([165, 253, 5, 87, 255, 90, 198, 97, 236, 75, 74, 205, 119, 102, 148, 243, 213, 102, 3, 104, 36, 251, 206, 152, 50, 114, 92, 65, 154, 84, 48, 47]))

let zeroBytes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

const sampleTx = {
  amount1: 7,
  amount2: 3,
  blknum1: 66004001,
  blknum2: 0,
  cur12: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0],
  newowner1: [116, 90, 78, 212, 118, 51, 233, 165, 245, 155,
    19, 234, 50, 191, 20, 131, 178, 219, 41, 65],
  newowner2: [101, 166, 194, 146, 88, 167, 6, 177, 55, 187, 239, 105, 27, 233, 12, 165, 29, 47, 182, 80],
  oindex1: 0,
  oindex2: 0,
  txindex1: 0,
  txindex2: 0
}
const sampletxSigned = {
  raw_tx: sampleTx,
  sig1: [172, 240, 111, 235, 159, 24, 36, 208, 125, 144, 104, 77, 164, 187, 181, 212, 19, 5, 40, 73, 213, 194, 57, 209, 146, 191, 98, 62, 203, 125, 158, 141, 118, 214, 78, 154, 41, 123, 146, 31, 111, 9, 176, 123, 237, 1, 226, 211, 252, 139, 105, 166, 27, 173, 5, 20, 125, 74, 151, 30, 163, 125, 238, 27, 28],
  sig2: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  signedTxBytes: [248, 209, 132, 3, 239, 36, 33, 128, 128, 128, 128, 128, 148, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 148, 116, 90, 78, 212, 118, 51, 233, 165, 245, 155, 19, 234, 50, 191, 20, 131, 178, 219, 41, 65, 7, 148, 101, 166, 194, 146, 88, 167, 6, 177, 55, 187, 239, 105, 27, 233, 12, 165, 29, 47, 182, 80, 3, 184, 65, 172, 240, 111, 235, 159, 24, 36, 208, 125, 144, 104, 77, 164, 187, 181, 212, 19, 5, 40, 73, 213, 194, 57, 209, 146, 191, 98, 62, 203, 125, 158, 141, 118, 214, 78, 154, 41, 123, 146, 31, 111, 9, 176, 123, 237, 1, 226, 211, 252, 139, 105, 166, 27, 173, 5, 20, 125, 74, 151, 30, 163, 125, 238, 27, 28, 184, 65, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
}

describe('signature', () => {
  it('should hash a message', () => {
    let hashed = hash(txInput)
    assert.deepStrictEqual(hashed, hashedTx)
  })
  it('should sign correct signature', () => {
    let signed = signature(txInput, alicePriv)
    assert.deepStrictEqual(signedTX, signed)
  })
  it('should produce 0 bytes for signature', () => {
    let zeroSig = zeroSignature()
    assert.deepStrictEqual(zeroBytes, zeroSig)
  })
  // test single sign
  it('should sign the entire transaction object correctly', () => {
    let singleSigned = singleSign(sampleTx, alicePriv)
    assert.deepStrictEqual(singleSigned, sampletxSigned)
  })
  // test signedEncoded
})
