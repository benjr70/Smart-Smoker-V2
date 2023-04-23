import { Grid } from "@mui/material";
import React, { useEffect, useState } from "react";
import { getPreSmokeById } from "../../../Services/preSmokeService";
import { preSmoke } from "../../common/interfaces/preSmoke";
import { getSmokeById, getSmokeProfileById, smokeProfile } from "../../../Services/smokerService";
import { PreSmokeCard } from "./preSmokeCard";
import { SmokeProfileCard } from "./smokeProfileCard";
import { normalize } from "path";

interface smokeReviewProps {
    smokeId: string
}


export function SmokeReview(props: smokeReviewProps): JSX.Element {
    let preSmokeInit: preSmoke = {
        weight: {
            weight: undefined,
            unit: undefined
        },
        steps: []
    };
    let smokeProfileInit: smokeProfile = {
        woodType: '',
        notes: '',
    }
    const [preSmoke, setPreSmoke] = useState(preSmokeInit);
    const [smokeProfile, setSmokeProfile] = useState(smokeProfileInit)

    useEffect( () => {
        getSmokeById(props.smokeId).then((result) => {
            getPreSmokeById(result.preSmokeId).then(preSmokeResult => {
                setPreSmoke(preSmokeResult);
            });
            getSmokeProfileById(result.smokeProfileId).then(smokeProfileResult => {
                setSmokeProfile(smokeProfileResult);
            })
         })
    }, [props.smokeId])

    return(
        <Grid item xs={11}  >
            <PreSmokeCard
                preSmoke={preSmoke}
            />
            <SmokeProfileCard
                smokeProfile={smokeProfile}
            />
        </Grid>
    )
}