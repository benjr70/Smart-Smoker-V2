import './card.style.css'

interface cardProps {
    content: any;
}

export function Card(props: cardProps) {
    return <div className='card'>
        {props.content}
    </div>;
}