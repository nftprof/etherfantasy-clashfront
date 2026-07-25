import 'tailwindcss/tailwind.css';
import React from 'react'

import Meta from "@partials/meta";
import LandLayout from "@layouts/LandLayout";
import dynamic from "next/dynamic";
const WebGLComponent = dynamic(() => import('@ui/landMap/WebGL'), { ssr: false })


/**
 * Land Selector Component
 * @constructor
 */
function LandSelector({ csrfToken, encrypted, timeStamp }) {

    return (
        <div>
            <Meta title="The Cryptoverse | Genesis" />
            <LandLayout>

                <WebGLComponent />

            </LandLayout>
        </div>
    )
}

export default LandSelector
