// @ts-nocheck
import 'tailwindcss/tailwind.css';
import React, {useEffect, useRef, useState} from 'react'
import {tokenMapFullColor} from "@ui/landSelector/UserActiveTokenList";

/**
 * Token Legend
 * @constructor
 */
function TokenLegend() {
    return (
        <div className={`flex space-x-4 w-full`}>
           <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                    <div className="rounded-full w-3 h-3 text-white bg-red-800 font-bold text-xs" />
                    <span className="text-white">Unavailble</span>
                </div>
                <div className="flex items-center space-x-2">
                    <div className={`rounded-full w-3 h-3 text-white font-bold text-xs ${tokenMapFullColor['Epic']}`} />
                    <span className="text-white">Epic</span>
                </div>
                <div className="flex items-center space-x-2">
                    <div className={`rounded-full w-3 h-3 text-white font-bold text-xs ${tokenMapFullColor['Giant']}`} />
                    <span className="text-white">Giant</span>
                </div>
                <div className="flex items-center space-x-2">
                    <div className={`rounded-full w-3 h-3 text-white font-bold text-xs ${tokenMapFullColor['Large']}`} />
                    <span className="text-white">Large</span>
                </div>
                <div className="flex items-center space-x-2">
                    <div className={`rounded-full w-3 h-3 text-white font-bold text-xs ${tokenMapFullColor['Medium']}`} />
                    <span className="text-white">Medium</span>
                </div>
                <div className="flex items-center space-x-2">
                    <div className={`rounded-full w-3 h-3 text-white font-bold text-xs ${tokenMapFullColor['Small']}`} />
                    <span className="text-white">Small</span>
                </div>
                <div className="flex items-center space-x-2">
                    <div className={`rounded-full w-3 h-3 text-white font-bold text-xs ${tokenMapFullColor['Single']}`} />
                    <span className="text-white">Single</span>
                </div>
            </div>

            <div className={`flex items-center space-x-2`}>
                <div className={`ml-auto flex items-center space-x-2`}>
                    <div className={`w-[12px] h-[12px] diagonal-stripe-beach rounded-full`} />
                    <span className="text-white">Beach</span>
                </div>
                <div className={`ml-auto flex items-center space-x-2`}>
                    <div className={`w-[12px] h-[12px] diagonal-stripe-port rounded-full`} />
                    <span className="text-white">Routers</span>
                </div>
            </div>
        </div>
    )
}
export default TokenLegend;