import { Card } from "../common/card";

export function name(){
    return (<>Name</>);
}

export function home() {
    return (<>
        <Card content={name()}></Card>
        </>
    );
}