//All of the constants required throughout the script
const moment = require('moment');
const winEject = require('win-eject');
colors = require('colors/safe');

//Color theme settings for colored text
colors.setTheme({
    info: 'green',
    time: 'yellow',
    dash: 'gray'
});

//Eject all DVDs
ejectDVDs();
function ejectDVDs() {
    winEject.eject('', function () {
        console.info(colors.time(moment().format('LTS')) + colors.dash(' - ') + colors.info('All DVDs have been ejected.'));
        process.exit();
    });
}