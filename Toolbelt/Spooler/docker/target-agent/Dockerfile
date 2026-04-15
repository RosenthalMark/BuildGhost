FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates iproute2 \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3 /usr/local/bin/python

WORKDIR /workspace

RUN mkdir -p /workspace/injected /opt/spooler/injection

COPY docker/target-agent/runtime_controller.py /opt/spooler/runtime/runtime_controller.py
COPY docker/target-agent/apply_netem.sh /opt/spooler/runtime/apply_netem.sh
RUN chmod +x /opt/spooler/runtime/runtime_controller.py /opt/spooler/runtime/apply_netem.sh

CMD ["sh", "-c", "if [ -f /opt/spooler/injection/bootstrap.sh ]; then sh /opt/spooler/injection/bootstrap.sh; fi; tail -f /dev/null"]
