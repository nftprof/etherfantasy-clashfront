import 'tailwindcss/tailwind.css';
import React, {useEffect, useState} from 'react'
import {MapIcon} from "@heroicons/react/outline";

interface Props {
    reset: () => void;
}

/**
 * Reset Map Function
 * @constructor
 */
function ResetMap({ reset }: Props) {
    return (
        <div onClick={() => reset() } className={`cursor-pointer`}>
            <div className={`hover:scale-[0.90] transition flex flex-col text-center text-white space-y-1 justify-center items-center`}>
                <div className={`bg-torch-red rounded-full p-2`}>
                    <MapIcon className="w-4 h-4 text-white" />
                </div>
                <span className={"text-[11px] leading-snug font-bold"}>Reset<br/>Zoom</span>
            </div>
        </div>
    )
}
export default ResetMap;
