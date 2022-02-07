import React, {useCallback, useState} from 'react';
import logo from './logo.svg';
import {tar} from 'tinytar';
import {gzip} from 'pako';
import './App.css';

interface FileInfo {
    name: string;
    data: string|Uint8Array;
    mtime?: number;
    uid?: number;
    gid?: number;
    mode?: number;
}

const downloadFile = (data: string, fileName: string) => {
    const a = document.createElement('a')
    a.href = data
    a.download = fileName
    document.body.appendChild(a)
    a.style.display = 'none'
    a.click()
    a.remove()
}

/**
 * build ar archive...
 */
function ar(inputFiles: FileInfo[]) {
    const encoder = new TextEncoder()
    const header = '!<arch>\n';
    const parts = [encoder.encode(header)];
    for (const file of inputFiles) {
        const {name = '', mtime = 0, uid = 0, gid = 0, mode = 0o100644, data} = file
        const fileHeader = (encoder.encode(
            name.padEnd(16) +
            mtime.toString().padEnd(12) +
            uid.toString().padEnd(6) +
            gid.toString().padEnd(6) +
            mode.toString(8).padEnd(8) +
            data.length.toString().padEnd(10) +
            '`\n'
        ));
        parts.push(fileHeader);
        if (data instanceof Uint8Array) {
            parts.push(data);
        } else if (typeof data === 'string') {
            parts.push(encoder.encode(data));
        }

        // Align files...
        if ((fileHeader.length + data.length) % 2 != 0) {
            parts.push(encoder.encode('\n'));
        }
    }
    return Uint8Array.from(parts.reduce((acc: number[], curr: Uint8Array) => [...acc, ...curr], []));
}

function App() {
    const [appid, setAppid] = useState('');
    const [target, setTarget] = useState('org.webosbrew.hbchannel');

    const onSubmit =  useCallback((evt) => {
        evt.preventDefault();
        console.info('xD');
        const version = '0.0.1';

        const data_tgz = gzip(
            tar([
                {
                    name: `usr/palm/applications/${appid}/appinfo.json`,
                    data: JSON.stringify({
                        id: appid,
                        version,
                        type: 'native',
                        main: 'run.sh',
                        title: 'Test app stub!',
                        vendor: 'stubapp',
                        icon: 'icon.png',
                        largeIcon: 'largeicon.png',
                        iconColor: '#00ff00',
                    }),
                    modifyTime: new Date(0)
                },
                {
                    name: `usr/palm/packages/${appid}/packageinfo.json`,
                    data: JSON.stringify({
                        id: appid,
                        version,
                        app: appid,
                    }),
                },
                {
                    name: `usr/palm/applications/${appid}/run.sh`,
                    data: `#!/usr/bin/env bash\nluna-send-pub -f -n 1 luna://com.webos.service.applicationManager/launch ${JSON.stringify(JSON.stringify({
                        id: target,
                        params: {},
                    }))}\n`,
                },
            ])
        );

        const control_tgz = gzip(
            tar([
                {
                    name: 'control',
                    data: Object.entries({
                        Package: appid,
                        Version: version,
                        Section: 'misc',
                        Priority: 'optional',
                        Architecture: 'all',
                        Maintainer: 'N/A <nobody@example.com>',
                        'webOS-Package-Format-Version': '2',
                        'webOS-Packager-Version': 'x.y.x',
                    }).map(([k, v]) => `${k}: ${v}`).join('\n'),
                },
            ])
        );

        const pkg = ar([
            {name: 'debian-binary', data: '2.0\n'},
            {name: 'control.tar.gz', data: control_tgz},
            {name: 'data.tar.gz', data: data_tgz},
        ]);

        const blob = new Blob([pkg], { type: 'application/octet-stream' });
        const url = window.URL.createObjectURL(blob);

        downloadFile(url, `${appid}_${version}.ipk`);

        setTimeout(() => window.URL.revokeObjectURL(url), 1000);

        return false;
    }, [appid, target]);

    return (
        <div className="app">
            <h1>webOS app stub builder</h1>

            <form onSubmit={onSubmit}>
                <input type="text" placeholder="appid" value={appid} onChange={(evt) => setAppid(evt.target.value)} />
                <input type="text" placeholder="target" value={target} onChange={(evt) => setTarget(evt.target.value)} />
                <button>Create</button>
            </form>
        </div>
    );
}

export default App;
