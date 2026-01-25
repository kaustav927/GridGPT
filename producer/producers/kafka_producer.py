"""
Kafka producer client for publishing IESO data to topics.
"""

import json
import logging
from typing import Any
from datetime import datetime

from confluent_kafka import Producer

logger = logging.getLogger(__name__)


def json_serializer(obj: Any) -> str:
    """Serialize objects to JSON, handling datetime."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


class KafkaProducerClient:
    """Async-compatible Kafka producer."""
    
    def __init__(self, bootstrap_servers: str):
        self.config = {
            'bootstrap.servers': bootstrap_servers,
            'client.id': 'ieso-producer',
            'acks': 'all',
            'retries': 3,
            'retry.backoff.ms': 1000,
        }
        self._producer: Producer | None = None
    
    @property
    def producer(self) -> Producer:
        """Lazy initialization of producer."""
        if self._producer is None:
            self._producer = Producer(self.config)
            logger.info(f"Created Kafka producer: {self.config['bootstrap.servers']}")
        return self._producer
    
    def _delivery_report(self, err, msg) -> None:
        """Callback for delivery reports."""
        if err is not None:
            logger.error(f"Delivery failed: {err}")
        else:
            logger.debug(f"Delivered to {msg.topic()}[{msg.partition()}]")
    
    async def publish(self, topic: str, data: dict) -> None:
        """Publish a single message to a topic."""
        try:
            value = json.dumps(data, default=json_serializer).encode('utf-8')
            self.producer.produce(
                topic=topic,
                value=value,
                callback=self._delivery_report
            )
            self.producer.poll(0)  # Trigger callbacks
        except Exception as e:
            logger.error(f"Failed to publish to {topic}: {e}")
            raise
    
    async def publish_batch(self, topic: str, records: list[dict]) -> None:
        """Publish a batch of messages to a topic."""
        for record in records:
            await self.publish(topic, record)
        
        # Flush to ensure all messages are sent
        self.producer.flush(timeout=10)
        logger.debug(f"Flushed {len(records)} messages to {topic}")
    
    def close(self) -> None:
        """Close the producer."""
        if self._producer:
            self._producer.flush()
            logger.info("Kafka producer closed")
