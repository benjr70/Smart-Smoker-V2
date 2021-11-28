import React from 'react';
import './bottomBar.style.css'

interface bottomBarButtonProps {
    title: string;
    OnClick: any;
}

interface buttonBarProps {
    homeOnClick: any;
    historyOnClick: any;
    settingsOnClick: any;
}

function BottomBarButton(props: bottomBarButtonProps) {
    return (<>
    <button className='button' onClick={props.OnClick}>
        {props.title}
    </button>
    </>
    );
}


export function BottomBar(props: buttonBarProps) {
    return (<>
    <div className='bottomBar'>
        <BottomBarButton
        title='Home'
        OnClick={props.homeOnClick}></BottomBarButton>
        <BottomBarButton
        title='History'
        OnClick={props.historyOnClick}></BottomBarButton>
        <BottomBarButton
        title='Settings'
        OnClick={props.settingsOnClick}></BottomBarButton>
    </div>
    </>);
}