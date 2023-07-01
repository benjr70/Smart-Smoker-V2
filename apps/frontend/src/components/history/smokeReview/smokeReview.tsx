import { Grid } from "@mui/material";
import React, { useEffect, useState } from "react";
import { getPreSmokeById } from "../../../Services/preSmokeService";
import { preSmoke } from "../../common/interfaces/preSmoke";
import { getSmokeById, getSmokeProfileById, smokeProfile } from "../../../Services/smokerService";
import { PreSmokeCard } from "../smokeCards/preSmokeCard";
import { SmokeProfileCard } from "../smokeCards/smokeProfileCard";
import { getTempsById } from "../../../Services/tempsService";
import { TempData } from "../../common/components/tempChart";
import { delay } from "../../smoke/smoke";
import { PostSmokeCard } from "../smokeCards/postSmokeCard";
import { PostSmoke } from "../../smoke/postSmokeStep/PostSmokeStep";
import { getPostSmokeById } from "../../../Services/postSmokeService";
import { getRatingById } from "../../../Services/ratingsService";
import { rating } from "../../common/interfaces/rating";
import { RatingsCard } from "../smokeCards/ratingsCard";

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
    let tempInit: TempData[] = [{
        ChamberTemp: 0,
        MeatTemp: 0,
        date: new Date(),
    }];
    let postSmokeInit: PostSmoke = {
        restTime: '',
        steps: [],
    }
    let ratingsInit: rating = {
        smokeFlavor: 0,
        seasoning: 0,
        tenderness: 0,
        overallTaste: 0,
        notes: ''
    }
    const [preSmoke, setPreSmoke] = useState(preSmokeInit);
    const [smokeProfile, setSmokeProfile] = useState(smokeProfileInit);
    const [temps, setTemps] = useState(tempInit);
    const [postSmoke, setPostSmoke] = useState(postSmokeInit);
    const [rating, setRatings] = useState(ratingsInit);

    useEffect( () => {
        getSmokeById(props.smokeId).then((result) => {
            getPreSmokeById(result.preSmokeId).then(preSmokeResult => {
                setPreSmoke(preSmokeResult);
            });
            getSmokeProfileById(result.smokeProfileId).then(smokeProfileResult => {
                setSmokeProfile(smokeProfileResult);
            })
            if(result.tempsId){
                getTempsById(result.tempsId).then(tempResult => {
                    if(tempResult.length > 0){
                        setTemps(tempResult);
                    }
                })
            }
            getPostSmokeById(result.postSmokeId).then(postSmokeResult => {
                setPostSmoke(postSmokeResult);
            })
            getRatingById(result.ratingId).then(ratings => {
                setRatings(ratings);
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
                temps={temps}
            />
            <PostSmokeCard
                postSmoke={postSmoke}
            />
            <RatingsCard
                ratings={rating}
            />
        </Grid>
    )
}