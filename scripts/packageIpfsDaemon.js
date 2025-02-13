/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Example usage:
// npm run package-ipfs-daemon -- --binary "/Applications/Google\\ Chrome\\ Canary.app/Contents/MacOS/Google\\ Chrome\\ Canary" --keys-directory path/to/key/dir

const commander = require('commander')
const fs = require('fs')
const mkdirp = require('mkdirp')
const path = require('path')
const replace = require('replace-in-file')
const util = require('../lib/util')
const ipfsVersion = '0.9.1'

const getIpfsDaemonPath = (platform) => {
  const ipfsPath = path.join('build', 'ipfs-daemon-updater', 'downloads')
  const myplatform = platform === 'win32' ? 'windows' : platform
  const ipfsFilename = `go-ipfs_v${ipfsVersion}_${myplatform}-amd64`
  return path.join(ipfsPath, ipfsFilename)
}

const getFsToolPath = () => {
  const ipfsPath = path.join('build', 'ipfs-daemon-updater', 'downloads')
  const toolFilename = `fs-repo-10-to-11`
  return path.join(ipfsPath, toolFilename)
}

const getOriginalManifest = (platform) => {
  return path.join('manifests', 'ipfs-daemon-updater', `ipfs-daemon-updater-${platform}-manifest.json`)
}

const packageIpfsDaemon = (binary, endpoint, region, platform, key) => {
  const originalManifest = getOriginalManifest(platform)
  const parsedManifest = util.parseManifest(originalManifest)
  const id = util.getIDFromBase64PublicKey(parsedManifest.key)

  util.getNextVersion(endpoint, region, id).then((version) => {
    const stagingDir = path.join('build', 'ipfs-daemon-updater', platform)
    const ipfsDaemon = getIpfsDaemonPath(platform)
    const fsRepoTool = (platform === 'darwin') ? getFsToolPath() : ''
    const crxOutputDir = path.join('build', 'ipfs-daemon-updater')
    const crxFile = path.join(crxOutputDir, `ipfs-daemon-updater-${platform}.crx`)
    const privateKeyFile = !fs.lstatSync(key).isDirectory() ? key : path.join(key, `ipfs-daemon-updater-${platform}.pem`)
    stageFiles(platform, ipfsDaemon, fsRepoTool, version, stagingDir)
    util.generateCRXFile(binary, crxFile, privateKeyFile, stagingDir)
    console.log(`Generated ${crxFile} with version number ${version}`)
  })
}

const stageFiles = (platform, ipfsDaemon, fsRepoTool, version, outputDir) => {
  const originalManifest = getOriginalManifest(platform)
  const outputManifest = path.join(outputDir, 'manifest.json')
  const outputIpfsClient = path.join(outputDir, path.parse(ipfsDaemon).base)

  const replaceOptions = {
    files: outputManifest,
    from: /0\.0\.0/,
    to: version
  }

  mkdirp.sync(outputDir)

  fs.copyFileSync(originalManifest, outputManifest)
  fs.copyFileSync(ipfsDaemon, outputIpfsClient)
  if (platform === 'darwin' && fsRepoTool) {
    const outputFsRepoTool = path.join(outputDir, path.parse(fsRepoTool).base)
    fs.copyFileSync(fsRepoTool, outputFsRepoTool)
  }

  replace.sync(replaceOptions)
}

util.installErrorHandlers()

commander
  .option('-b, --binary <binary>', 'Path to the Chromium based executable to use to generate the CRX file')
  .option('-d, --keys-directory <dir>', 'directory containing private keys for signing crx files', 'abc')
  .option('-f, --key-file <file>', 'private key file for signing crx', 'key.pem')
  .option('-e, --endpoint <endpoint>', 'DynamoDB endpoint to connect to', '')// If setup locally, use http://localhost:8000
  .option('-r, --region <region>', 'The AWS region to use', 'us-west-2')
  .parse(process.argv)

let keyParam = ''

if (fs.existsSync(commander.keyFile)) {
  keyParam = commander.keyFile
} else if (fs.existsSync(commander.keysDirectory)) {
  keyParam = commander.keysDirectory
} else {
  throw new Error('Missing or invalid private key file/directory')
}

if (!commander.binary) {
  throw new Error('Missing Chromium binary: --binary')
}

util.createTableIfNotExists(commander.endpoint, commander.region).then(() => {
  packageIpfsDaemon(commander.binary, commander.endpoint, commander.region, 'darwin', keyParam)
  packageIpfsDaemon(commander.binary, commander.endpoint, commander.region, 'linux', keyParam)
  packageIpfsDaemon(commander.binary, commander.endpoint, commander.region, 'win32', keyParam)
})
