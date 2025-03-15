import { Grid, TextField } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import { getCurrentPostSmoke, setCurrentPostSmoke } from "../../../Services/postSmokeService";
import { DynamicList } from "../../common/components/DynamicList";
import { IMaskInput } from 'react-imask';
import './postSmokeStep.style.css'

export interface PostSmoke {
    restTime: string;
    steps: string[];
    notes?: string;
}

type PostSmokeStepProps = {
    nextButton: JSX.Element;
};

export const PostSmokeStep: React.FC<PostSmokeStepProps> = ({ nextButton }) => {
    const [postSmokeState, setPostSmokeState] = useState<PostSmoke>({
        restTime: '',
        steps: [''],
        notes: ''
    });

    const latestState = useRef(postSmokeState);

    useEffect(() => {
        latestState.current = postSmokeState;
        }, [postSmokeState]);

    useEffect(() => {
        getCurrentPostSmoke().then(postSmoke => {
            setPostSmokeState({
                restTime: postSmoke.restTime,
                steps: postSmoke.steps,
                notes: postSmoke.notes
            });
        });

        return () => {
            setCurrentPostSmoke(latestState.current);
        };
    }, []);

    return (
        <Grid item sx={{ width: '100%' }}>
            <TextField
                sx={{ marginBottom: '10px' }}
                id="standard-basic"
                label="Rest Time"
                variant="outlined"
                value={postSmokeState.restTime}
                onChange={(event: any) => setPostSmokeState({...postSmokeState, restTime: event.target.value})}
                InputProps={{
                    inputComponent: TextMaskCustom as any
                }}
            />
            <Grid>
                <DynamicList
                    newline = {() => setPostSmokeState({...postSmokeState, steps: [...postSmokeState.steps, '']})}
                    removeLine = {(index: number) => setPostSmokeState({...postSmokeState, steps: postSmokeState.steps.filter((_, i) => i !== index)})}
                    steps={postSmokeState.steps}
                    onListChange={(step, index) => setPostSmokeState({...postSmokeState, steps: postSmokeState.steps.map((s, i) => i === index ? step : s)})} />
            </Grid>
            <Grid container direction="row" justifyContent='space-around'>
                <TextField
                    sx={{
                        marginTop: '10px',
                        marginBottom: '10px',
                        width: '100%'
                    }}
                    id="outlined-multiline-static"
                    label="Notes"
                    multiline
                    value={postSmokeState.notes}
                    onChange={(event: any) => setPostSmokeState({...postSmokeState, notes: event.target.value})}
                    rows={4}
                />
            </Grid>
            <Grid container flexDirection='row-reverse'>
                {nextButton}
            </Grid>
        </Grid>
    );
};

interface CustomProps {
    onChange: (event: { target: { name: string; value: string } }) => void;
    name: string;
}

const TextMaskCustom = React.forwardRef<HTMLElement, CustomProps>(
    function TextMaskCustom(props, ref) {
        const { onChange, ...other } = props;
        return (
            <IMaskInput
                {...other}
                mask="00:00"
                definitions={{
                    '#': /[1-9]/,
                }}
                onAccept={(value: any) => onChange({ target: { name: props.name, value } })}
                overwrite
            />
        );
    },
);