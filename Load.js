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

//load all DVDs
loadDVDs();
function loadDVDs() {
    winEject.close('', function () {
        console.info(colors.time(moment().format('LTS')) + colors.dash(' - ') + colors.info('All DVDs have been loaded.'));
        process.exit();
    });
}