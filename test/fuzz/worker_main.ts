import { workerData } from "worker_threads";

import main from "../../src/main";

process.on('disconnect', function() {
  console.log('parent exited')
  process.
exit();
});

main(workerData);