'use strict'

const fs = require('fs')
const path = require('path')
const chalk = require('chalk')
const inquirer = require('inquirer')
const filesize = require('filesize')
const complexFilter = require('complex-filter')
const through2 = require('through2')
const Listr = require('listr')
const Observable = require('zen-observable')
const IPFSApi = require('ipfs-api')
const Spinner = require('cli-spinner').Spinner

const messageSpace = 60
const simpleType2Subtypes = {
   Tiltseries: 'TiltSeries',
   Reconstruction: 'Reconstructions',
   Subvolume: 'Subvolumes',
   Keymov: 'Videos',
   Keyimg: 'Images',
   Snapshot: 'Images',
   Other: 'Others'
}

const ipfsDownload = new IPFSApi({
   host: 'gateway.ipfs.io', // 'ipfs.oip.fun',
   port: 443,
   protocol: 'https'
})

const spinnerLoadingTomo = new Spinner(chalk.cyan('Loading tomograms, please wait - ') + chalk.hex('#FF6E1E')('%s'))
spinnerLoadingTomo.setSpinnerString(18)

const OIPJS = require('oip-js').OIPJS
const Core = OIPJS({
   indexFilters: {
	   publisher: 'FTSTq8xx8yWUKJA5E3bgXLzZqqG9V6dvnr' //Jensen Lab publishing address
   }
})

const filterExistingFiles = (filesMetadata, manifestFile) => {
	return filesMetadata.filter((fileMetadata) => {
		const register = `${fileMetadata.location} : ${fileMetadata.file.getFilename()}`
		return manifestFile.indexOf(register) === -1
	})
}

function parseMetadata(artifacts, fileType) {
	const filesMetadata = []
	for (const artifact of artifacts) {
		let files = artifact.getFiles()
		if (!(fileType === 'All')) {
			files = files.filter((file) => {
				return fileType.indexOf(simpleType2Subtypes[file.getSubtype()]) !== -1
			})
		}
		const location = artifact.getLocation()
		for (const file of files) {
			filesMetadata.push({file, location})
		}
	}
	return filesMetadata
}

const buildDownloadList = function(artifacts, fileType, manifestFile) {
	const downloadInfo = {
		totalDownloadSize: 0,
		allowedFiles: []
	}
	process.stdout.write(chalk.cyan(printMessage('Analyzing metadata of files ', messageSpace)))
	const filesMetadata = parseMetadata(artifacts, fileType)
	const selectedFilesMetadata = filterExistingFiles(filesMetadata, manifestFile)
	downloadInfo.numberOfSelectedFilesMetadata = selectedFilesMetadata.length
	selectedFilesMetadata.forEach((fileMetadata) => {
		downloadInfo.totalDownloadSize += fileMetadata.file.getFilesize()
		downloadInfo.allowedFiles.push(fileMetadata.file.getFilename())	
	})
	return downloadInfo
}

const printMessage = (message, space) => {
   return message + '.'.repeat(space - message.length)
}

const parseManifest = (file = '.etdb-downloads.manifest.json') => {
	process.stdout.write(chalk.cyan(printMessage('Loading manifest data ', messageSpace)))
	const data = fs.readFileSync(file)
	const fileManifestDirty = data.toString().split('\n')
	process.stdout.write(chalk.green(' OK\n'))
	const fileManifest = fileManifestDirty.filter((items) => {
		return items !== ''
	})
	process.stdout.write(chalk.yellow(` -- Found ${fileManifest.length} items already in manifest.\n`))
	return fileManifest
}

const manifestExists = (file = '.etdb-downloads.manifest.json') => {
	return fs.existsSync(file)
}

const handleExistingData = (directoryName, manifestFilePath) => {
	let manifestFiles = []
	process.stdout.write(chalk.cyan(printMessage('Checking for existing local directory ', messageSpace)))
	if (!fs.existsSync(directoryName)) {
		process.stdout.write(chalk.red(' directory not found\n'))
		process.stdout.write(chalk.cyan(printMessage('Making a new local directory ', messageSpace)))
		fs.mkdirSync(directoryName)
		process.stdout.write(chalk.green(' OK\n'))
		process.stdout.write(chalk.cyan(printMessage('Creating a new manifest ', messageSpace)))
		fs.closeSync(fs.openSync(manifestFilePath, 'w'))
		process.stdout.write(chalk.green(' OK\n'))
	}
	else {
		process.stdout.write(chalk.green(' OK\n'))
		process.stdout.write(chalk.cyan(printMessage('Checking for existing manifest ', messageSpace)))
		if (manifestExists(manifestFilePath)) {
			process.stdout.write(chalk.green(' manifest found\n'))
			manifestFiles = parseManifest(manifestFilePath)
		}
		else {
			process.stdout.write(chalk.red(' manifest not found\n'))
			process.stdout.write(chalk.cyan(printMessage('Creating a new manifest ', messageSpace)))
			fs.closeSync(fs.openSync(manifestFilePath, 'w'))
			process.stdout.write(chalk.green(' OK\n'))
		}
	}
	return manifestFiles
}

module.exports = (queryStack, fileType, resume, threads) => {
	spinnerLoadingTomo.start()
	Core.Index.getArtifacts('*', (artifacts) => {
		spinnerLoadingTomo.stop()
		process.stdout.write('\n')
		const filter = complexFilter(queryStack)
		const selected = artifacts.filter(filter)
		let directoryName = resume || `etdb-download-${Date.now()}`
		const manifestFilePath = path.resolve(directoryName, '.etdb-downloads.manifest.txt')
		const manifestFiles = handleExistingData(directoryName, manifestFilePath)
		const downloadInfo = buildDownloadList(selected, fileType, manifestFiles)
		process.stdout.write(chalk.green(' OK\n'))
		downloadInfo.numberOfSelectedArtifacts = selected.length
		inquirer.prompt([{
			message: chalk.cyan(`\nThe search parameters selected a ${downloadInfo.numberOfSelectedArtifacts} records with ${downloadInfo.allowedFiles.length} files with a total of ${filesize(downloadInfo.totalDownloadSize, {base: 10})} for download. Would you like to proceed?`),
			type: 'confirm',
			name: 'answer'
		}]).then((answer) => {
			downloadInfo.answer = answer
			return downloadInfo
		})
		.then((downloadInfo) => {
			const promises = []
			const downloads = []
			if (downloadInfo.answer.answer) {
				const jobPath = path.resolve(directoryName)
				let currentStats = {
					dataDownloaded: 0,
					filesDownloaded: 0
				}
				process.stdout.write(chalk.cyan('Writing metadata...\n'))
				const selectedJSON = JSON.stringify(selected, null, ' ')
				fs.writeFileSync(path.resolve(jobPath, 'metadata.json'), selectedJSON)
				process.stdout.write(chalk.cyan('Initiating download...\n'))
				selected.forEach((artifact) => {
					const p = new Promise((res, rej) => {
						const artifactLocation = artifact.getLocation()
						const artifactPath = path.resolve(jobPath, artifactLocation)
						if (!fs.existsSync(artifactPath))
							fs.mkdirSync(artifactPath)
						let files = artifact.getFiles()
						const selectedFiles = files.filter((file) => {
							return downloadInfo.allowedFiles.indexOf(file.getFilename()) !== -1
						})
						selectedFiles.forEach((file) => {
							const ipfsFilePath = artifact.getLocation() + '/' + file.getFilename()
							const filePath = path.resolve(artifactPath, file.getDisplayName())
							const readStream = ipfsDownload.files.getReadableStream(ipfsFilePath)
							downloads.push(
								{
									title: ` ${chalk.green(artifactLocation)} - ${chalk.cyan(file.getDisplayName())}`,
									task: () => {
										return new Observable((observer) => {
											let downloaded = 0
											const totalDownload = file.getFilesize()
											observer.next(`Progress: ${filesize(downloaded, {base: 10})}/${filesize(totalDownload, {base: 10})}`)
											readStream
												.on('error', (err) => {
													console.log('Error in getting the data')
													throw err
												})
												.pipe(through2.obj((data, enc, next) => {
													const writeStream = fs.createWriteStream(filePath)
													data.content
														.on('data', (dataFlow) => {
															downloaded += dataFlow.length
															observer.next(`Progress: ${filesize(downloaded, {base: 10})}/${filesize(totalDownload, {base: 10})}`)
														})
														.on('error', (err) => {
															console.log('Error in getting the data')
															throw err
														})
														.pipe(writeStream)
														.on('finish', () => {
															const manifest = `${artifactLocation} : ${file.getFilename()}\n`
															fs.appendFileSync(manifestFilePath, manifest)
															observer.complete()
														})
														.on('error', (err) => {
															console.log('Error in processing the data')
															throw err
														})
												}))
												.on('error', (err) => {
													console.log('Error in retrieving the data')
													console.log(err)
													throw err
												})
										})
									}
								}
							)
						})
						res()
					})
					promises.push(p)
				})
			}
			return Promise.all(promises).then(() => {
				return downloads
			})
		})
		.then((downloads) => {
			const tasks = new Listr(downloads, {concurrent: threads})
			tasks.run()
				.catch((err) => {
					console.log('Error processing tasks')
					console.log(err)
				})
		})
	}, (error) => {
		spinnerLoadingTomo.stop()
		console.log('Error in getting the metadata of tomograms. OIP must be down.')
		console.error(error.message)
		throw error
		process.exit(1)
	})
}
