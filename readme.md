# A JS wrapper for [ExifTool by Phil Harvey](https://exiftool.org/)
There are plenty of other wrappers for ExifTool, but many of them lack the ability to write EXIF data. I wanted a module that was made with writing EXIF data as the primary goal without being overly complicated. \(It also has to work. I've come across a couple wrappers that didn't seem to work.\)

This wrapper will download the ExifTool for you from Phil Harvey's site. It can also scrape the tag data so that you can verify that the tag you want to write are valid prior to attempting to write them.

## Usage
```javascript
import EXIF from 'exiftool-js-read-write';

// The function passed as a parameter is an optional logging callback.
let exifTool = new EXIF((...data) => { }); 

// these are the ways to set exif data. 
let args1 = ["-all=","-json"]; // Works
let args2 = {document: "things", comment: "test"}; // Works
// let args3 = [{document: "things"},{ comment: "test"}]; // Does not work
exifTool.setExifData("image.png",false, true, args2).then((result) => { }).catch((error) => { });

// You can also send a collection of strings.
exifTool.setExifData("image.png",false, true, '-document="Some text"', '-artist="Bono"').then((result) => { }).catch((error) => { }); // Works too
```