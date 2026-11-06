import json
from pathlib import Path
import sys
import time
import uuid

import ios_simulator as simulator


app, output = (Path(argument).resolve() for argument in sys.argv[1:])
simulator.OUTPUT = output
state = {'installed': False, 'firstReady': False, 'reopened': False}
device = None


def ctl(*args, **options):
    return simulator.command(['xcrun', 'simctl', *args], **options)


def await_storage(data):
    deadline = time.monotonic() + 85
    while time.monotonic() < deadline:
        for database in data.glob('Library/CapacitorDatabase/*.db'):
            try:
                return simulator.read_workspace(database)
            except (OSError, ValueError, simulator.sqlite3.Error):
                continue
        time.sleep(2)
    raise TimeoutError('Initial SQLite workspace not ready')


try:
    inventory = json.loads(ctl('list', '--json', timeout=30))
    runtime, model = simulator.select_destination(inventory)
    device = ctl('create', 'Ironlaw Release ' + uuid.uuid4().hex[:8], model, runtime, timeout=50).strip()
    uuid.UUID(device)
    simulator.wait_boot(device, phase='release-simulator', timeout=240, output=output)
    ctl('install', device, str(app), timeout=90, log='release-install.log')
    state['installed'] = True
    first = simulator.launch_pid(ctl('launch', device, simulator.BUNDLE, timeout=45, log='release-launch.log'))
    data = Path(ctl('get_app_container', device, simulator.BUNDLE, 'data', timeout=30).strip())
    before = await_storage(data)
    state['firstReady'] = True
    ctl('terminate', device, simulator.BUNDLE, timeout=30)
    second = simulator.launch_pid(ctl('launch', device, simulator.BUNDLE, timeout=45, log='release-reopen.log'))
    after = await_storage(data)
    if first == second or before['payloadSha256'] != after['payloadSha256']:
        raise ValueError('Unexpected launch PID or data change')
    state['reopened'] = True
    time.sleep(4)
    ctl('io', device, 'screenshot', str(output / 'ios-simulator.png'), timeout=30)
except Exception as error:
    state['error'] = f'{type(error).__name__}: {error}'
    raise
finally:
    (output / 'simulator-evidence.json').write_text(json.dumps(state, indent=2))
    if device:
        try:
            ctl('delete', device, timeout=25, check=False)
        except (OSError, TimeoutError, simulator.subprocess.TimeoutExpired):
            pass
