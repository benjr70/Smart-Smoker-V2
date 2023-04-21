import { Grid } from "@mui/material";
import React, { useEffect, useState } from "react";
import { getPreSmokeById } from "../../../Services/preSmokeService";
import { preSmoke } from "../../common/interfaces/preSmoke";
import { getSmokeById } from "../../../Services/smokerService";
import { PreSmokeCard } from "./preSmokeCard";

interface smokeReviewProps {
    smokeId: string
}


export function SmokeReview(props: smokeReviewProps): JSX.Element {
    let test: preSmoke = {
        weight: {
            weight: undefined,
            unit: undefined
        },
        steps: []
    };
    const [preSmoke, setPreSmoke] = useState(test);

    useEffect( () => {
        getSmokeById(props.smokeId).then((result) => {
            getPreSmokeById(result.preSmokeId).then(preSmokeResult => {
                setPreSmoke(preSmokeResult);
            });
         })
    }, [props.smokeId])

    return(
        <Grid item xs={11}>
            <PreSmokeCard
                preSmoke={preSmoke}
            />
        </Grid>
    )
}