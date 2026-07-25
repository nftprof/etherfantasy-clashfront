import 'tailwindcss/tailwind.css';
import React, {useEffect, useState} from 'react'
import ReactDOMServer from 'react-dom/server';

/**
 * Land Selector Component
 * @constructor
 */
function StepByStepWidget({ stepData, callBack }) {
   const [ currentStep, setCurrentStep ] = useState<number>(0);
   const [ totalSteps, setTotalSteps ] = useState(stepData.length);

    /**
     * OnKeyDown
     * @param e
     */
   const onKeyDown = (e) => {
       switch(e.which || e.keyCode) {
           case 37: // left
               if(currentStep === 0) return;
               setCurrentStep(currentStep-1)
               break;
           case 39: // right
               if(currentStep === totalSteps-1) return;
               setCurrentStep(currentStep+1)
               break;
           default: return; // exit this handler for other keys
       }
       e.preventDefault(); // prevent the default action (scroll / move caret)
   }

   useEffect(() => {
       window.addEventListener('keydown', onKeyDown, false);

       return () => {
           window.removeEventListener('keydown', onKeyDown, false);
       }
   }, [ currentStep ])

    return (
            <div className={`h-[425px] max-w-[550px] z-[400] w-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transform shadow-2xl shadow-torch-red-400/10`}>
                    <div className={`flex flex-col items-center justify-center space-y-4 text-center z-[400] w-full bg-haiti-400/100 w-full rounded-lg p-8 px-10 h-full`}>
                        <span className={`text-white bg-haiti-500 p-1 px-4 rounded-full absolute top-0 mt-8`}>{currentStep+1}/{totalSteps}</span>

                        {stepData.map((data, key) => {
                            return (
                                key === currentStep && <div className={`space-y-4 text-center flex flex-col items-center`} key={key} dangerouslySetInnerHTML={{ __html: ReactDOMServer.renderToStaticMarkup(data) }} />
                            )
                        })}

                       <div className={`flex space-x-8 pt-4`}>
                           {currentStep !== totalSteps-1 ?
                               <span onClick={() => setCurrentStep(currentStep+1)} className={`button`}>Next Step</span>
                           :
                               <span className={`button button-secondary`} onClick={callBack}>Select Land</span>
                           }
                       </div>



                        <div className={`flex space-x-2 absolute bottom-0 pb-8`}>
                            {stepData.map((item, key) => {
                                return (
                                    <div key={key} onClick={() => setCurrentStep(key)} className={`${currentStep === key ? 'bg-haiti-200' : 'bg-haiti-600' } rounded-full cursor-pointer w-[10px] h-[10px]`} />
                                )
                            })}
                        </div>
                    </div>
            </div>
    )
}
export default StepByStepWidget;
