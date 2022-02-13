import React, {useCallback, useState} from 'react';
import logo from './logo.svg';
import {tar} from 'tinytar';
import {gzip} from 'pako';
import {Button, Col, Container, Form, Row} from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import {useFormik} from 'formik';

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

interface PackageInfo {
    appid: string;
    version: string;
    script: string;
    title?: string;
    iconColor?: string;
    visible?: boolean;
    launchIndicator: string;
}

function buildPackage(info: PackageInfo) {
    const {
        appid, version, script,
        title = 'Stub app',
        iconColor = "#ffffff",
        visible = true,
        launchIndicator,
    } = info;

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
                    iconColor,
                    visible,
                    noSplashOnLaunch: launchIndicator !== 'default',
                    spinnerOnLaunch: launchIndicator === 'spinner',
                    defaultWindowType: (launchIndicator === 'spinner') ? 'popup' : undefined,
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
                data: `#!/usr/bin/env bash\n${script}\n`,
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

    return new Blob([pkg], { type: 'application/octet-stream' });
}

function FormWrapper(props: { children: any, label: string, controlId?: string }) {
    return (
        <Form.Group as={Row} className="mb-3" controlId={props.controlId}>
            <Form.Label column sm={2}>
                {props.label}
            </Form.Label>
            <Col sm={10}>
                {props.children}
            </Col>
        </Form.Group>
    )
}

function App() {
    const formik = useFormik({
        initialValues: {
            appid: 'org.example.app',
            version: '0.0.1',
            script: '',
            title: 'Test stub app',
            iconColor: '#ff0000',
            visible: true,
            type: 'script',
            targetApp: '',
            targetParams: '{}',
            launchIndicator: 'default',
        },
        onSubmit: (values) => {
            const {appid, version, type, script, targetApp, targetParams} = values;
            const generatedScript = (type === 'shortcut') ? (
                `luna-send-pub -f -n 1 luna://com.webos.service.applicationManager/launch ${JSON.stringify(JSON.stringify({
                    id: targetApp,
                    params: JSON.parse(targetParams),
                }))}`
            ) : script;

            const blob = buildPackage({...values, script: generatedScript });
            const url = window.URL.createObjectURL(blob);

            downloadFile(url, `${appid}_${version}.ipk`);

            setTimeout(() => window.URL.revokeObjectURL(url), 1000);
        },
    });

    return (
        <Container>
            <h1>webOS app stub builder</h1>
            <Form onSubmit={formik.handleSubmit}>
                <FormWrapper label="Application ID">
                    <Form.Control id="appid" value={formik.values.appid} onChange={formik.handleChange} />
                </FormWrapper>

                <FormWrapper label="Version">
                    <Form.Control id="version" value={formik.values.version} onChange={formik.handleChange} />
                </FormWrapper>

                <FormWrapper label="Title">
                    <Form.Control id="title" value={formik.values.title} onChange={formik.handleChange} />
                </FormWrapper>

                <FormWrapper label="Icon color">
                    <Form.Control id="iconColor" type="color" value={formik.values.iconColor} onChange={formik.handleChange} />
                </FormWrapper>

                <FormWrapper label="">
                    <Form.Check
                        id="visible"
                        checked={formik.values.visible}
                        onChange={formik.handleChange}
                        type="checkbox"
                        label="Visible"
                        // checked={formik.values.visible}
                        // ={formik.values.visible}
                        // onChange={formik.handleChange}
                    />
                </FormWrapper>

                <FormWrapper label="Launch indicator">
                    <Form.Select id="launchIndicator" value={formik.values.launchIndicator} onChange={formik.handleChange}>
                        <option value="default">Default (splashscreen)</option>
                        <option value="spinner">Spinner</option>
                        <option value="none">None</option>
                    </Form.Select>
                </FormWrapper>

                <FormWrapper label="Stub type">
                    <Form.Select id="type" value={formik.values.type} onChange={formik.handleChange}>
                        <option value="shortcut">Shortcut</option>
                        <option value="script">Script</option>
                    </Form.Select>
                </FormWrapper>

                {formik.values.type === 'script' ? (
                    <FormWrapper label="Script">
                        <Form.Control id="script" as="textarea" value={formik.values.script} onChange={formik.handleChange} />
                    </FormWrapper>
                ) : (
                    <FormWrapper label="Target app">
                        <Form.Control id="targetApp" value={formik.values.targetApp} onChange={formik.handleChange} />
                    </FormWrapper>
                )}

                <Form.Group as={Row} className="mb-3">
                    <Col sm={{ span: 10, offset: 2 }}>
                        <Button type="submit">Build app</Button>
                    </Col>
                </Form.Group>
            </Form>
        </Container>
    );
}

export default App;
