console.log('MakeMKV Auto Rip Copyright (C) 2018 Zac Ingoglia');
console.log('This program comes with ABSOLUTELY NO WARRANTY');
console.log('This is free software, and you are welcome to redistribute it under certain conditions.');
console.log('The full licence file can be found in the root folder of this software as "LICENSE.md"');
console.log('Please fully read the README.md file found in the root folder before using this software.');
console.log('');
console.log('');
console.log('---Welcome to MakeMKV Auto Rip V0.1.0---');
console.log('---Running in Dev Mode---');
console.log('');
console.log('---Devloped by Zac Ingoglia---');
console.log('---Copyright 2018 Zac Ingoglia---');
console.log('');
console.log('');
console.log('Would you like to Auto Rip all inserted DVDs now?');
console.log('This includes both internal and USB DVD and Bluray drives.');
console.log('Press 1 to Rip.');
console.log('Press 2 to exit.');

function prompt(question) {
    return new Promise((resolve, reject) => {
        const { stdin, stdout } = process;

        stdin.resume();
        stdout.write(question);

        stdin.on('data', data => resolve(data.toString().trim()));
        stdin.on('error', err => reject(err));
    });
}

const user = {};
prompt("Rip or Dip? ")
    .then((TA) => {
        user.TA = TA;

        switch (TA) {
            case '1'
                : var msg = 'Beginning AutoRip... Please Wait.';
                console.log(msg);
                const makeMKV = '\"C:\\Program Files (x86)\\MakeMKV\\makemkvcon.exe\"';
                const exec = require('child_process').exec;

                function validateFileDate() {
                    // check data to make sure that you opened a valid file.

                    //is the length of data greater than 0

                    //split first line
                    //did we get more than one line
                    //does the first line have the expected number of elements in the array
                    //get version number of app/file
                    //does match our expected version
                    //if we don't get an true result on any of the above then raise exception to let the user know that the file or version isn't valid.
                    return; // "You have a bad file";
                }

                function validateDriveFileDate() {
                    // check data to make sure that you opened a valid file.

                    //is the length of data greater than 0

                    //split first line
                    //did we get more than one line
                    //does the first line have the expected number of elements in the array
                    //get version number of app/file
                    //does match our expected version
                    //if we don't get an true result on any of the above then raise exception to let the user know that the file or version isn't valid.
                    return; // "You have a bad file";
                }

                function makeTitleValidFolderPath(title) {
                    //escape out any chars that are not valid for file name. \
                    // TODO: make sure that we only return a valid folder path.
                    return title.replace(/['"]+/g, '');;
                }

                function getTimeInSeconds(timeArray) {
                    return (+timeArray[0]) * 60 * 60 + (+timeArray[1]) * 60 + (+timeArray[2]);
                }

                function createUniqueFolder(outputPath, folderName) {

                    var fs = require('fs');
                    var dir = outputPath + '\\' + folderName;
                    var folderCounter = 1;
                    if (fs.existsSync(dir)) {
                        while (fs.existsSync(dir + '-' + folderCounter)) {
                            folderCounter++;
                        }
                        dir += '-' + folderCounter;
                    }
                    fs.mkdirSync(dir);
                    return dir;
                }

                function getFileNumber(data) {

                    // var fs = require("fs"),
                    //     path = require("path"),
                    var myTitleSectionValue = null,
                        maxValue = 0;

                    // data = fs.readFileSync(path.join(dir, fileName), 'utf8');

                    var validationMessage = validateFileDate(data);
                    if (validationMessage) {
                        return validationMessage;
                    }

                    var lines = data.split("\n");
                    var validLines = lines.filter(line => line.startsWith("MSG:3028"));

                    validLines.forEach(line => {

                        var videoTimeString = line
                            .split(",")[9]
                            .replace(/['"]+/g, '');

                        var videoTimeArray = videoTimeString.split(':');

                        var videoTimeSeconds = getTimeInSeconds(videoTimeArray);

                        //process the largest file.
                        if (videoTimeSeconds > maxValue) {
                            maxValue = videoTimeSeconds;
                            myTitleSectionValue = line
                                .split(",")[3] //split by comma and get the element with the title.
                                .split(" ")[1] //get the element with the file number.
                                .replace("#", '') - 1; //strip off the hashtag and subtract 1 from the file number.

                        }
                    });

                    return myTitleSectionValue;

                }

                function getDriveInfo(data) {

                    var validationMessage = validateDriveFileDate(data);
                    if (validationMessage) {
                        return validationMessage;
                    }

                    var lines = data.split("\n");
                    var validLines = lines
                        .filter(line => {
                            //Get array of line attributes
                            var lineArray = line.split(",");

                            //make sure that the first element starts with "DRV:"
                            if ((lineArray[0].startsWith("DRV:"))) {

                                //Ensure that the number in the second element is = 2...meaning we have media
                                return (lineArray[1] == 2);
                            }

                        })
                        .map(line => {
                            var driveInfo = {
                                driveNumber: line.split(",")[0].substring(4),
                                title: makeTitleValidFolderPath(line.split(",")[5])
                            }
                            return driveInfo;

                        });

                    return validLines;

                }

                function getCommandData() {

                    return new Promise((resolve, reject) => {

                        console.info('Getting info for all discs...');
                        exec(makeMKV + ' -r info disc:index', (err, stdout, stderr) => {

                            if (stderr) {
                                reject(stderr);
                            }

                            //get the data for drives with discs.
                            console.info('Getting drive info...');
                            var driveInfo = getDriveInfo(stdout);

                            //get an array of promises to get the file numbers for the longest file from each valid disc.
                            var drivePromises = driveInfo.map(driveInfo => {

                                return new Promise((resolve, reject) => {

                                    console.info('Getting file number for drive title ' + driveInfo.driveNumber + '-' + driveInfo.title + '.');
                                    exec(makeMKV + ' -r info disc:' + driveInfo.driveNumber, (err, stdout, stderr) => {

                                        if (stderr) {
                                            reject(stderr);
                                        }

                                        var fileNumber = getFileNumber(stdout);
                                        console.info('Got file info for ' + driveInfo.driveNumber + '-' + driveInfo.title + '.');
                                        resolve({
                                            driveNumber: driveInfo.driveNumber,
                                            title: driveInfo.title,
                                            fileNumber: fileNumber
                                        });

                                    });

                                });

                            });

                            Promise.all(drivePromises)
                                .then(result => {
                                    resolve(result);
                                })
                                .catch(err => {
                                    reject(err);
                                });
                        });

                    });
                }


                function ripDVDs(outputPath) {

                    getCommandData()

                        .then(commandDataItems => {

                            commandDataItems.forEach(commandDataItem => {

                                var dir = createUniqueFolder(outputPath, commandDataItem.title);

                                console.info('Ripping Title ' + commandDataItem.title + '...');
                                exec(makeMKV + ' -r mkv disc:' + commandDataItem.driveNumber + ' ' + commandDataItem.fileNumber + ' ' + '\"' + dir + '\"', (err, stdout, stderr) => {

                                    if (stderr) {
                                        console.error('Critical Error Ripping ' + commandDataItem.title, stderr);
                                    } else {
                                        console.info('Done Ripping ' + commandDataItem.title);
                                    }

                                });

                            });

                        })
                        .catch(err => {
                            console.error(err);
                        });
                }

                ripDVDs('C:\\Users\\Win10 Test Drive\\Desktop\\Raw_MKV_Movies\\Upstream');
                break;
            case '2'
                : var msg = 'Exiting...';
                console.log(msg);
                process.exit();
                break;
            default:
                process.exit();
                break;
        }

    })
    .catch((error) => {
        console.log("Critical Error, Must Abort!");
        console.log(error);
        process.exit();
    })