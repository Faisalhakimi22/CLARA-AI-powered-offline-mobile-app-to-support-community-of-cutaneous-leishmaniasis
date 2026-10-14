"""Install a project-local JDK and Android command-line tools from official sources."""
from __future__ import annotations
import hashlib
import json
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / '.tooling'
CACHE = TOOLS / 'downloads'
SDK = TOOLS / 'android-sdk'

def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'CLARA-local-build'}), timeout=90)

def download(url, filename, algorithm, expected):
    target = CACHE / filename
    if target.exists() and hashlib.new(algorithm, target.read_bytes()).hexdigest() == expected:
        print(f'Using verified {filename}', flush=True)
        return target
    temp = target.with_suffix('.part')
    count = 0
    digest = hashlib.new(algorithm)
    with fetch(url) as response, temp.open('wb') as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
            digest.update(chunk)
            count += len(chunk)
            if count % (32 * 1024 * 1024) == 0:
                print(f'{filename}: {count // 1024 // 1024} MB downloaded', flush=True)
    if digest.hexdigest() != expected:
        raise RuntimeError(f'Checksum mismatch: {filename}')
    temp.replace(target)
    print(f'Checksum verified: {filename}', flush=True)
    return target

def extract(archive, destination):
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as bundle:
        for info in bundle.infolist():
            if not (destination / info.filename).resolve().is_relative_to(destination.resolve()):
                raise ValueError('Unexpected archive path')
        bundle.extractall(destination)

def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    with fetch('https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse') as response:
        jdk = json.load(response)[0]['binary']['package']
    archive = download(jdk['link'], jdk['name'], 'sha256', jdk['checksum'])
    with zipfile.ZipFile(archive) as bundle:
        jdk_directory = TOOLS / bundle.namelist()[0].split('/')[0]
    if not (jdk_directory / 'bin/java.exe').exists():
        print('Extracting local JDK...', flush=True)
        extract(archive, TOOLS)
    if not (SDK / 'cmdline-tools/latest/bin/sdkmanager.bat').exists():
        with fetch('https://dl.google.com/android/repository/repository2-3.xml') as response:
            repository = ET.fromstring(response.read())
        packages = [node for node in repository.iter() if node.tag.endswith('remotePackage') and node.attrib.get('path') == 'cmdline-tools;latest']
        if not packages:
            raise RuntimeError('Official repository has no cmdline-tools;latest entry')
        archive_info = next(node for node in packages[0].findall('./archives/archive') if node.findtext('host-os') == 'windows')
        complete = archive_info.find('complete')
        checksum = complete.find('checksum')
        url = 'https://dl.google.com/android/repository/' + complete.findtext('url')
        commandline = download(url, Path(url).name, checksum.attrib.get('type', 'sha1'), checksum.text.strip())
        staging = TOOLS / 'sdk-extract'
        extract(commandline, staging)
        source = (staging / 'cmdline-tools').resolve()
        destination = (SDK / 'cmdline-tools/latest').resolve()
        if not source.is_relative_to(TOOLS.resolve()) or not destination.is_relative_to(TOOLS.resolve()):
            raise ValueError('Toolchain move is outside the project tools folder')
        destination.parent.mkdir(parents=True, exist_ok=True)
        source.rename(destination)
    env = '\n'.join([
        f"$env:JAVA_HOME = '{jdk_directory.as_posix()}'",
        f"$env:ANDROID_HOME = '{SDK.as_posix()}'",
        '$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME',
        f"$env:GRADLE_USER_HOME = '{(TOOLS / 'gradle-home').as_posix()}'",
        '$env:PATH = "$env:JAVA_HOME/bin;$env:ANDROID_HOME/platform-tools;$env:PATH"',
    ]) + '\n'
    (TOOLS / 'android-env.ps1').write_text(env, encoding='utf-8')
    (ROOT / 'android/local.properties').write_text(f'sdk.dir={SDK.as_posix()}\n', encoding='utf-8')
    print(f'Toolchain configured. Source {TOOLS / "android-env.ps1"}', flush=True)

if __name__ == '__main__':
    main()
