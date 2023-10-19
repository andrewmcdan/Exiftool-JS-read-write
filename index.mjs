// TODO:
// 1. Add support for Mac
// 2. Find a JSON of all the tags and their descriptions or scrape it from the website
//    - https://exiftool.org/TagNames/index.html
//    - https://exiftool.org/TagNames/EXIF.html
// 3. Add support for custom config file
// 4. Add ability to generate a custom config file

//test

import fs from 'fs';
import AdmZip from 'adm-zip';
import fetch from 'node-fetch';
import { exec } from 'child_process';
import LargeDownload from 'large-download';
import cheerio, { load } from 'cheerio';

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
    constructor(loggerCB, loadTagData_en = false) {
        if (loggerCB !== null && loggerCB !== undefined) this.loggerCallback = loggerCB;
        else this.loggerCallback = null;

        this.exiftoolInstalled_1 = false;
        this.exiftoolInstalled_2 = false;
        this.exiftoolInstalled_3 = false;
        this.exiftoolInstalled = false;
        this.tagDataJsonLoaded = false;
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
                    }).catch((err) => { this.logger("EXIF: Error checking for exiftool: ", err); });
                }).catch((err) => {
                    this.logger("EXIF: Error downloading exiftool: ", err);
                });
            }
        }).catch((err) => { this.logger("EXIF: Error checking for exiftool: ", err); });
        if (loadTagData_en) {
            this.loadTagDataJson();
        }
    }

    loadTagDataJson = async () => {
        let waiter = [];
        if (checkForTagData() == false) {
            waiter.push(scrapeTags().then(async (tags) => {
                let success = saveTagData(tags);
                if (success !== true) {
                    this.tagDataJsonLoaded = false;
                } else {
                    let tagData = loadTagData();
                    if (typeof tagData === "object") {
                        this.tagData = tagData;
                        // console.log(this.tagData);
                        this.tagDataJsonLoaded = true;
                        // return true;
                    } else {
                        console.log("error 2: ", tagData);
                        this.tagDataJsonLoaded = false;
                        // return false;
                    }
                }
            }).catch((err) => {
                console.log("error 0: ", err);
                this.tagDataJsonLoaded = false;
                // return false;
            }));
        } else {
            let tagData = loadTagData();
            if (typeof tagData === "object") {
                this.tagData = tagData;
                // console.log(this.tagData);
                this.tagDataJsonLoaded = true;
                // return true;
            } else {
                console.log("error 2: ", tagData);
                this.tagDataJsonLoaded = false;
                // return false;
            }
        }
        await Promise.all(waiter);
        return this.tagDataJsonLoaded;
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
            // check to see if zip file exists
            try {
                if (fs.existsSync('./exiftool/exiftool.zip')) dl_url = null;
            } catch (err) {
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
            }

            downloadAndUnzip(dl_url, './exiftool/exiftool.zip', './exiftool').then((success) => {
                if (!success) {
                    this.logger("Error downloading exiftool");
                    reject("Error downloading exiftool");
                }
                resolve(true);
            }).catch((err) => {
                this.logger("Error downloading exiftool: ", err);
                reject("Error downloading exiftool: ", err);
            });

        });
    }

    logger = (...data) => {
        if (this.loggerCallback !== null && this.loggerCallback !== undefined) this.loggerCallback(...data);
    };

    getExifData = (filePath) => {
        return new Promise(async (resolve, reject) => {
            resolve();
        });
    };

    setExifData = (filePath, overwriteOriginal, verifyTagBool, ...data) => {
        return new Promise(async (resolve, reject) => {
            // console.log(data);
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
            // console.log("dataString: ", dataString);
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
            // console.log("tagsObj: ", tagsObj);
            if ((this.tagDataJsonLoaded == false) && verifyTagBool == true) this.loadTagDataJson();
            if ((this.tagDataJsonLoaded == false) && verifyTagBool == true) reject("tagDataJSON not loaded");
            else if (verifyTagBool) {
                let fileType = filePath.substring(filePath.lastIndexOf('.') + 1);
                // console.log("fileType: ", fileType);
                for (let key in tagsObj) {
                    // console.log("key: ", key);
                    await verifyTag({ name: key, fileType: fileType }, this.tagData).catch((err) => {
                        reject("Error verifying tag");
                    });
                }
            }
            this.logger("dataString: ", dataString);
            // attempt to write the data to the file using exiftool
            if (overwriteOriginal) dataString += "-overwrite_original ";
            this.runExifTool(filePath, dataString).then((result) => {
                this.logger("setExifData: result: ", result);
                // interpret result
                // if successful, resolve(true)
                if (result.success === true) resolve(true);
                // if unsuccessful, runExifTool() should have rejected with an error and the code below in the catch section should run
            }).catch(async (err) => {
                // if unsuccessful, attempt to write each tag individually
                this.logger("setExifData: error: ", err);
                if (err === "exiftool not installed") reject(ERRORS.EXIFTOOL_NOT_INSTALLED);
                if (err === "file does not exist") reject(ERRORS.FILE_NOT_FOUND);
                // attempt to write each tag individually
                for (let tag in tagsObj) {

                    let singleTagString = "";
                    singleTagString += `-${tag}=${tagsObj[tag]} `;
                    this.logger("singleTagString: ", singleTagString);
                    // keeping track of which ones fail and resolve(obj) where obj is the list of failed tags
                    if (overwriteOriginal) singleTagString += "-overwrite_original ";
                    await this.runExifTool(filePath, singleTagString).then((result) => {
                        this.logger("setExifData: result: ", result);
                        // interpret result
                        tagsObj[tag] = result.success;
                    }).catch((err) => {
                        tagsObj[tag] = false;
                    });
                }
                // if all tags fail, reject("failed to write exif data")
                let allTagsFailed = true;
                for (let tag in tagsObj) {
                    if (tagsObj[tag] === true) allTagsFailed = false;
                }
                if (allTagsFailed) reject(ERRORS.FAILED_WRITE_EXIF);
                resolve(tagsObj);
            });
        });
    }

    runExifTool = (filePath, args) => {
        return new Promise(async (resolve, reject) => {
            this.logger("runExifTool: args: ", args, "filePath: ", filePath);
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
                // this will run when the process exits. The process will not exit until the "enter" key is sent to it
                exiftoolRunner.on('exit', async (code) => {
                    while (!validData) { await waitSeconds(0.05); } // wait for the data to be valid (this is a hack
                    this.logger(`runExifTool: Child exited with code ${code}`);
                    // parse the output to determine if it was successful or not
                    stdoutString = stdoutString.trim();
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
                    } else if (stderrString.indexOf("Warning: Tag '") > -1) {
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
                // give the process a second to start up
                await waitSeconds(1); // give it a second to start up
                // wait for the process to finish
                while (runnerDataStreaming > runnerDataStreamingMax) {
                    // runnerDataStreaming will be incremented in the stdout.on('data') event
                    // so as long as it is more than runnerDataStreamingMax, we will wait
                    // once it is equal to runnerDataStreamingMax, that means there hasn't 
                    // been any new data for 1 second, so we can assume the process is done
                    // and continue to send the "enter" key to the process to close it
                    await waitSeconds(1);
                    runnerDataStreamingMax++;
                }
                exiftoolRunner.stdin.write('\r\n'); // write the "enter" key to the process
            } catch (err) {
                this.logger("runExifTool: Error: ", err);
                reject(err);
            }
        });
    }
}

const downloadAndUnzip = (url, zipPath, extractPath) => {
    return new Promise(async (resolve, reject) => {
        /*let waitingForFilename = true;
        if (url !== null) {
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
            while (waitingForFilename) { await waitSeconds(1); }
        }*/

        try {
            // if the url is null, that means the zip file already exists. Just extract it.
            if (url === null) {
                const zip = new AdmZip(zipPath);
                zip.extractAllTo(extractPath, true);
                resolve(true);
            }

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
                await waitSeconds(0.5);
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

const waitSeconds = (seconds) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => { resolve(); }, seconds * 1000);
    });
};

const checkForTagData = () => {
    // check to see if executable file exists
    try {
        if (fs.existsSync('./exiftool/tagData.json')) resolve(true);
        else return false;
    } catch (err) {
        return "Error checking for tagData.json: " + err;
    }
}

const loadTagData = () => {

    // on resolve, return the tagData object
    // load tag file into tagData object
    try {
        let tagData = JSON.parse(fs.readFileSync('./exiftool/tagData.json', 'utf8'));
        return tagData;
    } catch (err) {
        return "Error loading tagData.json: " + err;
    }
}

const saveTagData = (tags) => {
    // save tagData object to tag file
    try {
        fs.writeFileSync('./exiftool/tagData.json', JSON.stringify(tags, null, '\t'));
        // console.log("tagData.json saved");
        resolve(true);
    } catch (err) {
        console.log("Error saving tagData.json: ", err);
        return "Error saving tagData.json: " + err;
    }
}

const scrapeTags = () => {
    return new Promise(async (resolve, reject) => {
        try {
            // fetch the html from the website
            const baseUrl = 'https://exiftool.org/TagNames/';
            const indexUrl = 'index.html';
            let response = await fetch(baseUrl + indexUrl);
            let html = await response.text();
            // get all the tags
            let tags = [];
            let linksToFollow = [];
            // load the html into cheerio
            let $ = cheerio.load(html);
            const innerTable = $('table.inner');
            innerTable.each((i, elem) => {
                const aElems = $(elem).find('a');
                aElems.each((i, elem) => {
                    const tag = $(elem).text();
                    const link = $(elem).attr('href');
                    linksToFollow.push(link);
                });
            });

            const tagPromises = linksToFollow.map(async (link) => {
                let response = await fetch(baseUrl + link);
                let html = await response.text();
                // magic happens here
                let $ = cheerio.load(html);
                // find all the h2 tags
                const h2Elems = $('h2');
                // find all the tables with class inner
                const innerTables = $('table.inner');
                let obj = {};
                obj.fileType = link.split('.')[0];
                obj.group = [];
                h2Elems.each((i, elem) => {
                    if (i < innerTables.length) {
                        elem = $(elem);
                        let group = {};
                        group.name = elem.text();
                        group.tags = [];
                        let table = innerTables[i];
                        const tableRows = $(table).find('tr');
                        tableRows.each((p, el) => {
                            let td = [];
                            let tag = {};
                            let splitLength = 0;
                            $(el).children().each((q, el) => {
                                if (el.name == 'td') {
                                    let tdText = $(el).text();
                                    let tdSplit;
                                    if (tdText.indexOf("\n") > -1) tdSplit = tdText.split('\n');
                                    else tdSplit = tdText.split('<br>');

                                    tdSplit.forEach((str, i) => {
                                        tdSplit[i] = str.trim();
                                    });
                                    splitLength = tdSplit.length;
                                    td.push(tdSplit);
                                }
                            });
                            try {
                                for (let k = 0; k < splitLength; k++) {
                                    if (td[0] !== undefined) tag.id = (td[0][k] === undefined) || (td[0][k] === null) ? td[0][0] : td[0][k]; // if the tag doesn't have an id, use the first one
                                    else tag.id = null;
                                    if (td[1] !== undefined) tag.name = (td[1][k] === undefined) || (td[1][k] === null) ? td[1][0] : td[1][k]; // if the tag doesn't have a name, use the first one
                                    else tag.name = null;
                                    if (td[2] !== undefined) tag.writable = (td[2][k] === undefined) || (td[2][k] === null) ? td[2][0] : td[2][k]; // if the tag doesn't have writable, use the first one
                                    else tag.writable = null;
                                    if (td[3] !== undefined) tag.values = (td[3][k] !== undefined) || (td[3][k] === null) ? td[3][0] : td[3][k]; // if the tag doesn't have values, use the first one
                                    else tag.values = null;
                                    group.tags.push(tag);
                                }
                            } catch (err) {
                                console.log({ err });
                                console.log({ td });
                            }
                        });
                        obj.group.push(group);
                    }
                });
                tags.push(obj);
            });

            await Promise.all(tagPromises);

            if (tags.length === 0) reject("No tags found");
            resolve(tags);
        } catch (err) {
            console.log({ err });
            reject(err);
        }
    });
}

// verfiyTagData()
// params:
// tagData: 
//      - object with the following properties:
//          - fileType: string, filename extension such as .jpg, .png, .mp4, etc.
//          - name: string
//          - data: string, number, boolean, etc. to be verified that it is valid
const verifyTag = (tag, tagDataObject) => {
    return new Promise(async (resolve, reject) => {
        if (tagDataObject === undefined || tagDataObject === null) {
            // console.log("tagDataObject is undefined or null");
            reject("tagDataObject is undefined or null");
        }
        let fileExtension = tag.fileType;
        let tagName = tag.name;
        let tagData = tag.data;
        // walk through the tagDataObject and find the tag.fileType
        let fileTypeFound = false;
        let fileTypeIndex = -1;
        for (let i = 0; i < tagDataObject.length; i++) {
            if (tagDataObject[i].fileType == fileExtMutex(fileExtension)) {
                fileTypeFound = true;
                fileTypeIndex = i;
                break;
            }
        }
        // TODO: finish this

        console.log("fileTypeFound: ", fileTypeFound);
        resolve(fileTypeFound);
    });
}

const fileExtMutex = (ext) => {
    // alter the file extension to match the file extensions in the json file
    // convert ext to lowercase
    ext = ext.toUpperCase();
    switch (ext) {
        case 'JPG':
            return 'JPEG';
        default:
            return ext;
    }
}

export default EXIF;