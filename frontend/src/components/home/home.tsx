import React from 'react';
import { Card } from "../common/card";
import { ReactComponent as EditIcon} from '../common/media/editIcon.svg';
import './home.style.css';



export class Home extends React.Component<{},{name: string, isEditing: boolean}> {
    constructor(props: any){
        super(props);
        this.state = {name: 'undefined',
                      isEditing: false}
    }


  name(){
    return (
        <div className="NameCard">
             <input  
             className="name"
             disabled={!this.state.isEditing}
             defaultValue={this.state.name}>
            </input >   
            <button 
            className="edit"
            onClick={this.OnEditNameClick}
            >
                <EditIcon></EditIcon>
            </button>
        </div>);
    }

    GetName() {
        return this.state.name;
    }

    OnEditNameClick = () => {
        if(this.state.isEditing){
           // this.setState({isEditing: false, name: })
        }
        this.setState({isEditing: !this.state.isEditing});
    }

    render() {
        return (
            <Card content={this.name()}></Card>
           );
    }
}
