import fs from 'fs';
import AdmZip from 'adm-zip';
import fetch from 'node-fetch';
import { exec } from 'child_process';
import LargeDownload from 'large-download';


class EXIF{
    constructor() {
        this.exiftoolInstalled = false;
        // check to make sure directories exist
        try{
            if(!fs.existsSync('./exiftool')) fs.mkdirSync('./exiftool');
        }catch(err){
            logger("Error creating exiftool directory: ", err);
        }
        // check to make sure exiftool is installed
        // if no exiftool, download it
    }

    waitSeconds = (seconds) => {
        return new Promise((resolve, reject) => {
            setTimeout(() => { resolve(); }, seconds * 1000);
        });
    };

    logger = (...data) => {
        if(this.loggerCallback !== null && this.loggerCallback !== undefined) this.loggerCallback(...data);
    };

    getExifData = (filePath) => {
        return new Promise(async (resolve, reject) => {
            resolve();
        });
    };

    setExifData = (filePath, data) => {
        return new Promise( async (resolve, reject) => {
            // parse data to determine if it is a string or an object or an array
            // then build it into an object with the correct format

            // attempt to write the data to the file using exiftool
            // if successful, resolve(true)

            // if unsuccessful, attempt to write each tag individually
            // keeping track of which ones fail and resolve(obj) where obj is the list of failed tags
            
            // if all tags fail, reject("failed to write exif data")

            // if exiftool is not installed, reject("exiftool not installed")

            resolve();
        });
    }

    runExifTool = (filePath, args) => {
        return new Promise( async (resolve, reject) => {
            // attempt to run exiftool with the provided arguments
            // if successful, resolve(object with results from tool)

            // if unsuccessful, resolve(false)

            // if exiftool is not installed, reject("exiftool not installed")

            resolve();
        });
    }

    downloadAndUnzip = (url, zipPath, extractPath) => {
        return new Promise(async (resolve, reject) => {
            let waitingForFilename = true;
            fetch(url).then((response) => {
                const contentDisposition = response.headers.get("content-disposition");
                console.log("contentDisposition: ", contentDisposition);
                if (contentDisposition) {
                    const match = /filename=([^;]+)/.exec(contentDisposition);
                    if (match) {
                        const filename = match[1];
                        console.log("File name:", filename);
                    } else {
                        console.log("No filename found in Content-Disposition header");
                    }
                } else {
                    console.log("Content-Disposition header not found in the response");
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
                        console.log("Download error. Retrying: ", {error}, {url}, {zipPath}, {extractPath});
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
                    if (this.downloadProgressCallback !== null) this.downloadProgressCallback();
                }

                const zip = new AdmZip(zipPath);
                zip.extractAllTo(extractPath, true);
                resolve(true);
            } catch (error) {
                console.error("Error: ", {error});
                reject(false);
            }
        });
    };
}

export default EXIF;