interface StarsProps {
  rating: number;
}

export default function Stars({ rating }: StarsProps) {
  return (
    <span className="stars" aria-label={`${rating} yıldız`}>
      {'★'.repeat(rating)}
      {'☆'.repeat(5 - rating)}
    </span>
  );
}
