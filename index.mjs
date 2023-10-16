// TODO:
// 1. Add support for Mac
// 2. Find a JSON of all the tags and their descriptions or scrape it from the website
//    - https://exiftool.org/TagNames/index.html
//    - https://exiftool.org/TagNames/EXIF.html
// 3. Add support for custom config file
// 4. Add ability to generate a custom config file


import fs from 'fs';
import AdmZip from 'adm-zip';
import fetch from 'node-fetch';
import { exec } from 'child_process';
import LargeDownload from 'large-download';


const ERRORS = {
    FILE_NOT_FOUND: 'File not found',
    TAG_NOT_WRITABLE: 'Tag not writable',
    EXIFTOOL_NOT_INSTALLED: 'Exiftool not installed',
    NO_WRITABLE_TAGS_SET: 'No writable tags set',
    NOTHING_TO_DO: 'Nothing to do',
    CANT_CREATE_BACKUP_FILE: 'Can\'t create backup file',
    UNKNOWN_ERROR: 'Unknown error',
    FAILED_WRITE_EXIF: 'Failed to write exif data'
};

class EXIF {
    constructor(loggerCB) {
        if (loggerCB !== null && loggerCB !== undefined) this.loggerCallback = loggerCB;
        else this.loggerCallback = null;

        this.exiftoolInstalled_1 = false;
        this.exiftoolInstalled_2 = false;
        this.exiftoolInstalled_3 = false;
        this.exiftoolInstalled = false;
        // check to make sure directories exist
        try {
            if (!fs.existsSync('./exiftool')) fs.mkdirSync('./exiftool');
        } catch (err) {
            this.logger("EXIF: Error creating exiftool directory: ", err);
            return;
        }
        // check to make sure exiftool is installed
        this.checkForExifTool().then((installed) => {
            if (!installed) {
                this.downloadExifTool().then((success) => {
                    if (!success) return null;
                    this.checkForExifTool().then((installed) => {
                        if (installed) return true;
                    });
                }).catch((err) => {
                    this.logger("EXIF: Error downloading exiftool: ", err);
                });
            }
        });
    }

    setLoggerCallback = (callback) => {
        this.loggerCallback = callback;
    }

    getExiftoolExecutable = () => {
        if (this.exiftoolInstalled_1) return 'exiftool/exiftool.exe';
        if (this.exiftoolInstalled_2) return 'exiftool/exiftool';
        if (this.exiftoolInstalled_3) return 'exiftool/exiftool(-k).exe';
        return null;
    }

    setDownloadProgressCallback = (callback) => {
        this.downloadProgressCallback = callback;
    }

    checkForExifTool = () => {
        return new Promise(async (resolve, reject) => {
            // check to see if executable file exists
            try {
                if (fs.existsSync('./exiftool/exiftool.exe')) this.exiftoolInstalled_1 = true;
                if (fs.existsSync('./exiftool/exiftool')) this.exiftoolInstalled_2 = true;
                if (fs.existsSync('./exiftool/exiftool(-k).exe')) this.exiftoolInstalled_3 = true;
                if (this.exiftoolInstalled_1 || this.exiftoolInstalled_2 || this.exiftoolInstalled_3) this.exiftoolInstalled = true;
            } catch (err) {
                this.logger("Error checking for exiftool: ", err);
                reject("Error checking for exiftool: ", err);
            }
            resolve(this.exiftoolInstalled);
        });
    }

    downloadExifTool = () => {
        return new Promise(async (resolve, reject) => {
            // get platform
            const platform = process.platform;
            let dl_url = '';
            if (platform === 'win32') {
                dl_url = 'https://exiftool.org/exiftool-12.67.zip';
            } else if (platform === 'darwin') {
                dl_url = 'https://exiftool.org/ExifTool-12.67.dmg';
            } else if (platform === 'linux') {
                this.logger("Linux is not supported yet");
                reject("Linux is not supported yet");
            } else {
                this.logger("Platform not supported");
                reject("Platform not supported");
            }

            // check to see if zip file exists
            try {
                this.downloadAndUnzip(dl_url, './exiftool/exiftool.zip', './exiftool').then((success) => {
                    if (!success) {
                        this.logger("Error downloading exiftool");
                        reject("Error downloading exiftool");
                    }
                    resolve(true);
                }).catch((err) => {
                    this.logger("Error downloading exiftool: ", err);
                    reject("Error downloading exiftool: ", err);
                });
            } catch (err) {
                this.logger("Error downloading exiftool: ", err);
                reject("Error downloading exiftool: ", err);
            }
        });
    }

    waitSeconds = (seconds) => {
        return new Promise((resolve, reject) => {
            setTimeout(() => { resolve(); }, seconds * 1000);
        });
    };

    logger = (...data) => {
        if (this.loggerCallback !== null && this.loggerCallback !== undefined) this.loggerCallback(...data);
    };

    getExifData = (filePath) => {
        return new Promise(async (resolve, reject) => {
            resolve();
        });
    };

    setExifData = (filePath, overwriteOriginal, ...data) => {
        return new Promise(async (resolve, reject) => {
            console.log(data);
            // parse data to determine if it is a string or an object or an array
            // then build it into a string with the correct format
            let dataString = "";
            if (typeof data === "object") {
                // check to see if data is an object with keys and values
                // or if it is an object with an array of objects
                if (data.length === undefined) {
                    // data is an object with keys and values
                    // build the string
                    let string = "";
                    for (let key in data) {
                        string += `-${key}="${data[key]}" `;
                    }
                    dataString = string;
                } else {
                    // data is an object with an array of objects
                    // build the string
                    let string = "";
                    data.forEach((obj) => {
                        // check to see if obj is a string or an object
                        if (typeof obj == 'string') string += obj + " ";
                        else {
                            // obj is an object
                            let objString = "";
                            for (let key in obj) {
                                if (!isNaN(parseInt(key))) {
                                    objString += `${obj[key]} `; // if the key is a number, just add the value
                                } else {
                                    objString += `-${key}="${obj[key]}" `; // if the key is not a number, add the key and value
                                }
                            }
                            string += objString + " "; // add the objString to the string
                        }
                    });
                    dataString = string;
                }
            } else {
                // data is a string
                dataString = data;
            }

            console.log("dataString: ", dataString);

            let tagsObj = {};
            // parse the dataString to get the tags and values
            let dataStringSplit = dataString.split(" ");
            dataStringSplit.forEach((str) => {
                if (str.indexOf("-") === 0) {
                    // this is a tag
                    let tagSplit = str.split("=");
                    let tag = tagSplit[0].replace("-", "");
                    let value = tagSplit[1];
                    tagsObj[tag] = value;
                }
            });
            console.log("tagsObj: ", tagsObj);

            this.logger("dataString: ", dataString);
            // attempt to write the data to the file using exiftool
            if (overwriteOriginal) dataString += "-overwrite_original ";
            this.runExifTool(filePath, dataString).then((result) => {
                this.logger("setExifData: result: ", result);
                // interpret result
                if (result.success === false) reject(result.error);
                // if successful, resolve(true)
                resolve(true);
            }).catch((err) => {
                // if unsuccessful, attempt to write each tag individually
                this.logger("setExifData: error: ", err);
                if (err === "exiftool not installed") reject(ERRORS.EXIFTOOL_NOT_INSTALLED);
                if (err === "file does not exist") reject(ERRORS.FILE_NOT_FOUND);
                // attempt to write each tag individually
                for(let tag in tagsObj) {
                    let singleTagString = "";
                    singleTagString += `-${tag}=${tagsObj[tag]} `;
                    this.logger("singleTagString: ", singleTagString);
                    // keeping track of which ones fail and resolve(obj) where obj is the list of failed tags
                    if (overwriteOriginal) singleTagString += "-overwrite_original ";
                    this.runExifTool(filePath, singleTagString).then((result) => {
                        this.logger("setExifData: result: ", result);
                        // interpret result
                        tagsObj[tag] = result.success;
                    }).catch((err) => {
                        tagsObj[tag] = false;
                    });
                }
            });
            // if all tags fail, reject("failed to write exif data")
            let allTagsFailed = true;
            for(let tag in tagsObj) {
                if (tagsObj[tag] === true) allTagsFailed = false;
            }
            if (allTagsFailed) reject(ERRORS.FAILED_WRITE_EXIF);
            resolve(tagsObj);
        });
    }

    runExifTool = (filePath, args) => {
        return new Promise(async (resolve, reject) => {
            if (this.exiftoolInstalled === false) reject(ERRORS.EXIFTOOL_NOT_INSTALLED);
            // attempt to run exiftool with the provided arguments
            // if successful, resolve(object with results from tool)
            try {
                let runnerDataStreaming = 1;
                let runnerDataStreamingMax = 0;
                let executablePath = fs.realpathSync(this.getExiftoolExecutable());
                if (!fs.existsSync(executablePath)) reject(ERRORS.EXIFTOOL_NOT_INSTALLED);
                if (!fs.existsSync(filePath)) reject(ERRORS.FILE_NOT_FOUND);
                let filePathAbs = fs.realpathSync(filePath);
                let stdoutString = "";
                let stderrString = "";
                this.logger("executing: ", `\"${executablePath}\" ${args} \"${filePathAbs}\"`);
                let validData = false;
                let exiftoolRunner = exec(`\"${executablePath}\" ${args} \"${filePathAbs}\"`, (error, stdout, stderr) => {
                    if (error) {
                        this.logger(`runExifTool: error: ${error.message}`);
                        //reject(error);
                    }
                    if (stderr) {
                        this.logger(`runExifTool: stderr: ${stderr}`);
                        //reject(stderr);
                    }
                    this.logger(`runExifTool: stdout: ${stdout}`);
                    // stdoutString += stdout;
                    stderrString = stderr;
                    // stderrString += error;
                    validData = true;
                });
                await this.waitSeconds(1); // give it a second to start up
                while (runnerDataStreaming > runnerDataStreamingMax) {
                    // runnerDataStreaming will be incremented in the stdout.on('data') event
                    // so as long as it is more than runnerDataStreamingMax, we will wait
                    // once it is equal to runnerDataStreamingMax, that means there hasn't 
                    // been any new data for 1 second, so we can assume the process is done
                    // and continue to send the "enter" key to the process to close it
                    await this.waitSeconds(1);
                    runnerDataStreamingMax++;
                }
                exiftoolRunner.stdin.write('\r\n'); // write the "enter" key to the process

                exiftoolRunner.on('exit', async (code) => {
                    while(!validData) { await this.waitSeconds(0.05); } // wait for the data to be valid (this is a hack
                    this.logger(`runExifTool: Child exited with code ${code}`);
                    // parse the output to determine if it was successful or not
                    let returnObject = { success: false, stdout: stdoutString, stderr: stderrString, exitCode: code };
                    if (code !== 0) reject(returnObject);
                    try {
                        // first try to parse the output as JSON
                        returnObject = JSON.parse(stdoutString);
                        returnObject.success = true;
                        returnObject.string = stdoutString;
                        resolve(returnObject);
                    } catch (err) {
                    }
                    if (stdoutString.indexOf("ExifTool Version Number") > -1) {
                        returnObject.success = true;
                        resolve(stdoutString);
                    } else if (stderrString.indexOf("Error: File not found") > -1) {
                        returnObject.success = false;
                        returnObject.error = ERRORS.FILE_NOT_FOUND;
                        reject(returnObject);
                    } else if (stderrString.indexOf("Error: No writable tags set") > -1) {
                        returnObject.success = false;
                        returnObject.error = ERRORS.NO_WRITABLE_TAGS_SET;
                        reject(returnObject);
                    } else if (stdoutString.indexOf("Nothing to do") > -1) {
                        returnObject.success = false;
                        returnObject.error = ERRORS.NOTHING_TO_DO;
                        reject(returnObject);
                    } else if (stderrString.indexOf("Error: Can't create backup file") > -1) {
                        returnObject.success = false;
                        returnObject.error = ERRORS.CANT_CREATE_BACKUP_FILE;
                        reject(returnObject);
                    }else if (stderrString.indexOf("Warning: Tag '") > -1) {
                        returnObject.success = false;
                        returnObject.error = ERRORS.TAG_NOT_WRITABLE;
                        reject(returnObject);
                    } else if (stdoutString.indexOf("image files updated") > -1) {
                        returnObject.success = true;
                        resolve(returnObject);
                    } else {
                        returnObject.success = false;
                        returnObject.error = ERRORS.UNKNOWN_ERROR;
                        reject(returnObject);
                    }
                });
                exiftoolRunner.stdout.on('data', (data) => {
                    runnerDataStreaming++;
                    stdoutString += data;
                    // reset the runnerDataStreamingMax to 1 second from now
                    if (runnerDataStreamingMax > runnerDataStreaming + 1) runnerDataStreamingMax = runnerDataStreaming + 1;
                });
            } catch (err) {
                this.logger("runExifTool: Error: ", err);
                reject(err);
            }
        });
    }

    downloadAndUnzip = (url, zipPath, extractPath) => {
        return new Promise(async (resolve, reject) => {
            let waitingForFilename = true;
            fetch(url).then((response) => {
                const contentDisposition = response.headers.get("content-disposition");
                // console.log("contentDisposition: ", contentDisposition);
                if (contentDisposition) {
                    const match = /filename=([^;]+)/.exec(contentDisposition);
                    if (match) {
                        const filename = match[1];
                        // console.log("File name:", filename);
                    } else {
                        // console.log("No filename found in Content-Disposition header");
                    }
                } else {
                    // console.log("Content-Disposition header not found in the response");
                }
            }).catch((error) => {
                console.error("Error:", error);
            }).finally(() => { waitingForFilename = false; });

            while (waitingForFilename) { await this.waitSeconds(1); }

            try {
                let downloading = true;

                const download = new LargeDownload({
                    link: url,
                    destination: zipPath,
                    timeout: 300000,
                    retries: 3,
                    onRetry: (error) => {
                        console.log("Download error. Retrying: ", { error }, { url }, { zipPath }, { extractPath });
                    },
                    minSizeToShowProgress: Infinity
                });

                download.load().then(() => {
                    downloading = false;
                    download.onRetry = null;
                }).catch(() => {
                    downloading = false;
                    download.onRetry = null;
                    reject(false);
                });

                while (downloading) {
                    await this.waitSeconds(0.5);
                    if (this.downloadProgressCallback !== null && this.downloadProgressCallback != undefined) this.downloadProgressCallback();
                }

                const zip = new AdmZip(zipPath);
                zip.extractAllTo(extractPath, true);
                resolve(true);
            } catch (error) {
                console.error("Error: ", { error });
                reject(false);
            }
        });
    };
}

export default EXIF;