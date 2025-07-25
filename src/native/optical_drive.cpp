#include <napi.h>
#ifdef _WIN32
#include <windows.h>
#include <winioctl.h>
#include <mmsystem.h>  // For MCI functions
#include <string>
#include <vector>
#include <iostream>
#pragma comment(lib, "winmm.lib")  // Link the multimedia library
#endif

using namespace Napi;

#ifdef _WIN32
// Windows-specific implementation using DeviceIoControl
class WindowsOpticalDrive {
public:
    // Try MCI approach (doesn't require admin)
    static bool EjectDriveMCI(const std::string& driveLetter) {
        std::cout << "[C++ DEBUG] Trying MCI eject (cdrom device type)" << std::endl;
        
        MCIERROR result = mciSendStringA("set cdrom door open", NULL, 0, NULL);
        
        std::cout << "[C++ DEBUG] MCI cdrom eject result: " << result << std::endl;
        return result == 0;
    }
    
    // Try MCI approach for loading (doesn't require admin)
    static bool LoadDriveMCI(const std::string& driveLetter) {
        std::cout << "[C++ DEBUG] Trying MCI load (cdrom device type)" << std::endl;
        
        MCIERROR result = mciSendStringA("set cdrom door closed", NULL, 0, NULL);
        
        std::cout << "[C++ DEBUG] MCI cdrom load result: " << result << std::endl;
        return result == 0;
    }

    static bool EjectDrive(const std::string& driveLetter) {
        // Debug output to console
        std::cout << "[C++ DEBUG] EjectDrive received: \"" << driveLetter << "\" (length: " << driveLetter.length() << ")" << std::endl;
        
        // First try DeviceIoControl approach (fastest, but requires admin)
        std::wstring devicePath = L"\\\\.\\" + std::wstring(driveLetter.begin(), driveLetter.end());
        
        // Debug output for device path
        std::wcout << L"[C++ DEBUG] Device path: \"" << devicePath << L"\"" << std::endl;
        
        HANDLE hDevice = CreateFileW(
            devicePath.c_str(),
            GENERIC_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            NULL,
            OPEN_EXISTING,
            0,
            NULL
        );

        if (hDevice != INVALID_HANDLE_VALUE) {
            DWORD bytesReturned;
            BOOL result = DeviceIoControl(
                hDevice,
                IOCTL_STORAGE_EJECT_MEDIA,
                NULL,
                0,
                NULL,
                0,
                &bytesReturned,
                NULL
            );

            CloseHandle(hDevice);
            
            if (result) {
                std::cout << "[C++ DEBUG] DeviceIoControl eject succeeded" << std::endl;
                return true;
            }
        }
        
        // DeviceIoControl failed, try MCI approach
        DWORD error = GetLastError();
        std::cout << "[C++ DEBUG] DeviceIoControl failed with error: " << error << ", trying MCI..." << std::endl;
        
        return EjectDriveMCI(driveLetter);
    }

    static bool LoadDrive(const std::string& driveLetter) {
        // Debug output to console
        std::cout << "[C++ DEBUG] LoadDrive received: \"" << driveLetter << "\" (length: " << driveLetter.length() << ")" << std::endl;
        
        // First try DeviceIoControl approach (fastest, but requires admin)
        std::wstring devicePath = L"\\\\.\\" + std::wstring(driveLetter.begin(), driveLetter.end());
        
        // Debug output for device path
        std::wcout << L"[C++ DEBUG] Device path: \"" << devicePath << L"\"" << std::endl;
        
        HANDLE hDevice = CreateFileW(
            devicePath.c_str(),
            GENERIC_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            NULL,
            OPEN_EXISTING,
            0,
            NULL
        );

        if (hDevice != INVALID_HANDLE_VALUE) {
            DWORD bytesReturned;
            BOOL result = DeviceIoControl(
                hDevice,
                IOCTL_STORAGE_LOAD_MEDIA,
                NULL,
                0,
                NULL,
                0,
                &bytesReturned,
                NULL
            );

            CloseHandle(hDevice);
            
            if (result) {
                std::cout << "[C++ DEBUG] DeviceIoControl load succeeded" << std::endl;
                return true;
            }
        }
        
        // DeviceIoControl failed, try MCI approach
        DWORD error = GetLastError();
        std::cout << "[C++ DEBUG] DeviceIoControl load failed with error: " << error << ", trying MCI..." << std::endl;
        
        return LoadDriveMCI(driveLetter);
    }
};
#endif

// Node.js wrapper functions
Value EjectDrive(const CallbackInfo& info) {
    Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        TypeError::New(env, "Drive letter argument required").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string driveLetter = info[0].As<String>().Utf8Value();

#ifdef _WIN32
    bool success = WindowsOpticalDrive::EjectDrive(driveLetter);
    return Boolean::New(env, success);
#else
    TypeError::New(env, "Native optical drive operations only supported on Windows").ThrowAsJavaScriptException();
    return env.Null();
#endif
}

Value LoadDrive(const CallbackInfo& info) {
    Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        TypeError::New(env, "Drive letter argument required").ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string driveLetter = info[0].As<String>().Utf8Value();

#ifdef _WIN32
    bool success = WindowsOpticalDrive::LoadDrive(driveLetter);
    return Boolean::New(env, success);
#else
    TypeError::New(env, "Native optical drive operations only supported on Windows").ThrowAsJavaScriptException();
    return env.Null();
#endif
}

Object Init(Env env, Object exports) {
    exports.Set(String::New(env, "ejectDrive"), Function::New(env, EjectDrive));
    exports.Set(String::New(env, "loadDrive"), Function::New(env, LoadDrive));
    return exports;
}

NODE_API_MODULE(optical_drive_native, Init)