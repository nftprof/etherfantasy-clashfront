import 'tailwindcss/tailwind.css';
import React, {useEffect, useState} from 'react'
import Countdown, { zeroPad } from 'react-countdown';

/**
 * Countdown Timer
 * @param onCallback
 * @constructor
 */
export default function CountdownTimer({onCallback}) {
    const renderer = ({ hours, minutes, seconds, completed }) => {
        if (completed) {
            // Render a completed state
            return <>Completed Kicking</>;
        } else {
            // Render a countdown
            return <span>{zeroPad(minutes)} Min {zeroPad(seconds)} Sec</span>;
        }
    };
    return (
        <>
            <Countdown
                date={Date.now() + 10000 * 60}
                renderer={renderer}
                precision={2}
                zeroPadTime={1}
                onComplete={() => onCallback()}
            />

        </>
    )
}
