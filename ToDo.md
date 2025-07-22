---Section One (Ripper)---

--Done--Create working settings.json file so that users can modify select information that may differ between computers
    --Done--Have the base location for rips be customizable through the settings.json file
        --Done--New folder will have to be generated before running console as the console won't do this for you
         folder will also have to be passed as a var so that the command can pick it up and append it to the file path
         Ripping command: "makemkvcon.exe -r mkv disc:{driveNameVar} {titleNumberVar} "SettingJson configured filepath\{DVDFolderVar}""
            Ex: makemkvcon.exe -r mkv disc:0 0 "C:\MovieRips\MyMovie"
--Done--Interpert DVD drives with discs loaded and write drive names to vars to be called later
    Use command "makemkvcon.exe -r info DRV:index > "node directory\DriveLog.txt"" (inside of MakeMKV directory) to get DriveLog.txt file to use to pull drive names from
        Ex: makemkvcon.exe -r info DRV:index > "C:\AutoRip\logs\DriveLog.txt"
--Done--Pass each drive name var individually into title gen command
    "makemkvcon.exe -r info disc:{driveNameVar} > "node directory\TitlesLog.txt"" (inside of MakeMKV directory) This generates the TitlesLog.txt file
        Ex: makemkvcon.exe -r info disc:0 > "C:\AutoRip\logs\TitlesLog.txt"
--Done--use that TitlesLog.txt file to get the longest title and add that title number (in console format i.e. 0,1,2 not 1,2,3) to a var that can be called later
--Done--Call the title number var into the dvd rip command to rip that disc to desired location
--Done--Be able to rip all DVDs loged to vars one at a time without restarting code (i.e. run file once and it'll rip all dvds one at a time)
--Done--Publish to GitHub
--Done--Add time stamps to log messages
--Done--Add char subtractors to remove chars that aren't valid in a file name from being used to generate folder names
--Done--Add Batch file into release version
--Done--Add Exit section to exit out of AutoRip when it's run from a bat file
--Done--Fix config file so that AutoRip.js actually calls it
--Done--Fix Ripping so that DVDs rip synchronously insted of asynchronously
--Done--Clean up and reorganize code to be more readable (due to the mess caused by the syncronous conversion update)
--Done--Fix GitHub settings so that node packages are not tracked (i.e. they are manually downloaded by the end user) so that Git download package is smaller
--Done--Add windows batch file so the user can install node packages without downloading them in the git package or typing the command manually
--Done--Add color messages to make console more readable
--Done--Improve the feel of color messages
--Done--Add logging option to send all STDout messages to log files instead of keeping them hidden in variables
--Done--Add ability for user to send logs to file and choose log path
--Done--Add Option to auto eject all drives after ripping
--Done--Fix last DVD to rip writting a blank log file instead of a proper one (it looks like that may have been fixed accidently during the latest code reorder)
--Done--Fix auto eject only ejecting 1 disc
--Done--Create seperate ejecting and loading files
--Done--Fix config file so that "enabled" settings are no longer case sensitive
--Done--Fix "Following items were ripped" to only show non failed items
--Done--Fix issues with some (all) bluray discs not ripping for some reason (may be an unfixable disc speific issue)
    --Done--Must run a bluray through the raw console to discover the error
--Done--Add "The Following DVDs filed to rip" message
--Done--Fix DriveLoader.bat not working
--Done--Test to make sure ejecting and logging can be disabled without crashing the program (all combos)
--Done--Add documentation on ejecting and loading files
--Done--Fix "following DVD titles failed/successfully ripped" returning "undefined" instead of proper titles
--Done--Add info in README file regarding best settings to set in the graphical MakeMKV app since the console pulls settings from it
--Done--Fix log generator so that when a previously ripped DVD is ripped again a new log file will be generated instead of overwriting the old one
--On Hold--Fix config file so that single slashes can be used
Add exception handling in sections that lack it
    True successfully saved MSG codes
        MSG:5005 - X titles saved
        --Done--MSG:5036 - Copy complete X titles saved
    True Failed to save MSG codes
        MSG:3042 - IFO file for VTS #X is corrupt, VOB file must be scanned... (this one may not always return fail)
        MSG:3035 - Cellwalk algorithm failed trying calltrim algorithm
        MSG:3002 - Calculated BUP offset for VTS #X does not match one in IFO header (this may be the most accurate "fail" message code)
        MSG:5010 - Failed to open disc
    Info MSG codes
        MSG:3024 - Complex multiplex encountered (this is what makes some DVDs take a very long time to gather disc info)
        MSG:1005 - This is the very first line in the log (this should be used to output the MakeMKV version to the user and warn if there is a version mismatch)
        MSG:5075 - New Version of MakeMKV available
        MSG:5021 - Current version of MakeMKV is too old (Must be updated)
Add MakeMKV file validation to ensure MakeMKV is installed and running an acceptable version (Use the MSG codes)
Add option for sounds to play when each DVD is completed
Rebuild the independent DriveLoader.bat file in node so that standard windows command prompt is only needed to run a single .js file without any additional code
    This is how AutoRip.Bat/.js is built
Add config option to run MakeMKVAutoRip in repeat mode
    This mode will prompt the user to load the next set of DVDs at the end of the rip session and (opon confirmation that the new set is in) close the DVD trays and begin to rip again
    This will be useful if the user has a very large amount of discs and would like to streamline the process of starting a rip session
    Note: AutoRip must wait ~10 to 15 seconds after the drives are loaded so that the user has a chance to manually load drives that lack the servo required to pull the tray in.
        A warning telling the user to close any open drive trays should play during the 10-15 second waiting period